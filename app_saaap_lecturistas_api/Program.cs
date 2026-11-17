using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<LecturistasSql>();
builder.Services.AddSingleton(_ => new MemoryCache(new MemoryCacheOptions { SizeLimit = 10_000 }));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    var origenes = builder.Configuration.GetSection("Cors:Origenes").Get<string[]>() ?? [];
    policy.WithOrigins(origenes).WithMethods("GET", "POST", "PUT")
        .WithHeaders("Authorization", "Content-Type");
}));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "local",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1)
        }));
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseCors();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    try
    {
        await next();
    }
    catch (SqlSinConfigurarException) when (!context.Response.HasStarted)
    {
        app.Logger.LogWarning("Configura SqlServer:BaseDatos y SqlServer:Contrasena para habilitar SQL Server.");
        await Results.Problem(statusCode: 503, title: "La conexión con SQL Server está pendiente de configuración.")
            .ExecuteAsync(context);
    }
    catch (SqlException exception) when (!context.Response.HasStarted)
    {
        var error = exception.Number switch
        {
            51001 => (409, "El calendario no existe o está cerrado."),
            51002 => (404, "El medidor no existe."),
            51003 => (409, "El medidor no tiene lectura inicial."),
            51004 => (409, "Hay más de una lectura vigente para el medidor y calendario."),
            51005 => (400, "Captura la lectura final."),
            51006 => (400, "La lectura final debe ser mayor o igual a la lectura inicial."),
            51007 => (409, "La lectura cambió durante la captura. Vuelve a cargarla."),
            51008 or 51009 => (400, "Revisa el filtro y el texto de búsqueda."),
            _ => (503, "SQL Server no pudo completar la operación.")
        };
        if (error.Item1 == 503)
            app.Logger.LogWarning("Error de SQL Server {Numero} en {Ruta}.",
                exception.Number, context.Request.Path);

        await Results.Problem(statusCode: error.Item1, title: error.Item2).ExecuteAsync(context);
    }
});

app.MapGet("/salud", () => Results.Ok(new { servicio = "app_saaap_lecturistas_api" }));

var api = app.MapGroup("/api");
api.MapPost("/login", async (LoginEntrada entrada, LecturistasSql sql, MemoryCache sesiones,
    CancellationToken cancellationToken) =>
{
    var codigo = entrada.EmpleadoCodigo?.Trim();
    var clave = entrada.Contrasena;
    if (string.IsNullOrEmpty(codigo) || codigo.Length > 10 || string.IsNullOrEmpty(clave))
        return Results.BadRequest(new { mensaje = "Ingresa un código de empleado de hasta 10 caracteres y su contraseña." });

    var lecturista = await sql.BuscarLecturista(codigo, cancellationToken);
    if (lecturista?.Clave is null || !CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(lecturista.Clave), Encoding.UTF8.GetBytes(clave)))
        return Results.Unauthorized();

    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    var vence = DateTimeOffset.UtcNow.AddHours(8);
    sesiones.Set(token, lecturista.Codigo, new MemoryCacheEntryOptions
    {
        AbsoluteExpiration = vence,
        Size = 1
    });
    return Results.Ok(new { token, expiraEn = vence, empleadoCodigo = lecturista.Codigo, nombre = lecturista.Nombre });
}).RequireRateLimiting("login");

var captura = api.MapGroup("");
captura.AddEndpointFilter(async (context, next) =>
{
    var token = ObtenerToken(context.HttpContext.Request);
    var sesiones = context.HttpContext.RequestServices.GetRequiredService<MemoryCache>();
    if (token is null || !sesiones.TryGetValue(token, out _))
        return Results.Unauthorized();

    return await next(context);
});

captura.MapPost("/logout", (HttpRequest request, MemoryCache sesiones) =>
{
    sesiones.Remove(ObtenerToken(request)!);
    return Results.NoContent();
});

captura.MapGet("/calendarios", async (LecturistasSql sql, CancellationToken ct) =>
    Results.Ok(await sql.ListarCalendarios(ct)));

captura.MapGet("/calendarios/{calendarioId:long}/resumen", async (long calendarioId, LecturistasSql sql,
    CancellationToken ct) =>
{
    if (!CalendarioValido(calendarioId))
        return Results.BadRequest(new { mensaje = "Indica un calendario válido." });

    return Results.Ok(await sql.ObtenerResumenCalendario(calendarioId, ct));
});

captura.MapGet("/medidores", async (string buscarPor, string texto, LecturistasSql sql, CancellationToken ct) =>
{
    buscarPor = buscarPor.Trim().ToUpperInvariant();
    texto = texto.Trim();
    if (buscarPor is not ("MEDIDOR" or "CUENTA" or "NOMBRE") || texto.Length is < 1 or > 200)
        return Results.BadRequest(new { mensaje = "Indica MEDIDOR, CUENTA o NOMBRE y un texto de 1 a 200 caracteres." });

    return Results.Ok(await sql.BuscarMedidores(buscarPor, texto, ct));
});

captura.MapGet("/lecturas/captura", async (string medidorSerie, long calendarioId, LecturistasSql sql, CancellationToken ct) =>
{
    if (!CapturaValida(medidorSerie, calendarioId))
        return Results.BadRequest(new { mensaje = "Indica una serie y un calendario válidos." });

    return Results.Ok(await sql.ObtenerCaptura(medidorSerie, calendarioId, ct));
});

captura.MapPut("/lecturas/captura", async (LecturaEntrada entrada, LecturistasSql sql, CancellationToken ct) =>
{
    if (!CapturaValida(entrada.MedidorSerie, entrada.CalendarioId) ||
        entrada.LecturaFinal is null or < 0 or > 9_999_999_999L)
        return Results.BadRequest(new { mensaje = "Indica una serie, un calendario y una lectura final entera de hasta 10 dígitos." });

    return Results.Ok(await sql.GuardarLectura(
        entrada.MedidorSerie!, entrada.CalendarioId, entrada.LecturaFinal.Value, ct));
});

app.Run();

static string? ObtenerToken(HttpRequest request)
{
    var authorization = request.Headers.Authorization.ToString();
    return authorization.Length == 71 && authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authorization[7..]
        : null;
}

static bool CapturaValida(string? serie, long calendarioId) =>
    !string.IsNullOrWhiteSpace(serie) && serie.Length <= 40 && CalendarioValido(calendarioId);

static bool CalendarioValido(long calendarioId) => calendarioId is > 0 and <= 9_999_999_999L;

record LoginEntrada(string? EmpleadoCodigo, string? Contrasena);
record LecturaEntrada(string? MedidorSerie, long CalendarioId, long? LecturaFinal);
