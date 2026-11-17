using System.Data;
using Microsoft.Data.SqlClient;

sealed class LecturistasSql(IConfiguration configuracion, IWebHostEnvironment entorno)
{
    public async Task<Lecturista?> BuscarLecturista(string codigo, CancellationToken ct)
    {
        var filas = await Consultar("dbo.app_Lecturista_Login", fila => new Lecturista(
            Texto(fila, "LecturistaUsuario")!,
            Texto(fila, "LecturistaNombre"),
            Texto(fila, "LecturistaClave")), ct, Cadena("@EmpleadoCodigo", 10, codigo));

        // El SP puede devolver filas idénticas si el empleado tiene varias altas activas.
        return filas.Distinct().Take(2).ToArray() is [var lecturista] ? lecturista : null;
    }

    public async Task<IReadOnlyList<object>> ListarCalendarios(CancellationToken ct) =>
        await Consultar("dbo.app_Calendario_ListarAbiertos", fila => new
        {
            CalendarioId = Entero(fila, "CalendarioID"),
            CalendarioNombre = Texto(fila, "CalendarioNombre")
        }, ct);

    public async Task<object> ObtenerResumenCalendario(long calendarioId, CancellationToken ct) =>
        (await Consultar("dbo.app_Lectura_ResumenCalendario", fila => new
        {
            CalendarioId = Entero(fila, "CalendarioID"),
            MedidoresActivos = fila.GetInt64(fila.GetOrdinal("MedidoresActivos")),
            ConLectura = fila.GetInt64(fila.GetOrdinal("ConLectura")),
            Pendientes = fila.GetInt64(fila.GetOrdinal("Pendientes"))
        }, ct, DecimalSql("@CalendarioID", calendarioId))).Single();

    public async Task<IReadOnlyList<object>> BuscarMedidores(string filtro, string texto, CancellationToken ct) =>
        await Consultar("dbo.app_Medidor_Buscar", fila => new
        {
            MedidorSerie = Texto(fila, "MedidorSerie"),
            ContratoId = Entero(fila, "ContratoID"),
            NoCuenta = Texto(fila, "NoCuenta"),
            Nombre = Texto(fila, "Nombre"),
            Colonia = Texto(fila, "Colonia"),
            Direccion = Texto(fila, "Direccion")
        }, ct, Cadena("@BuscarPor", 10, filtro),
            new SqlParameter("@Texto", SqlDbType.NVarChar, 200) { Value = texto });

    public async Task<object> ObtenerCaptura(string serie, long calendarioId, CancellationToken ct) =>
        (await Consultar("dbo.app_Lectura_ObtenerCaptura", fila => new
        {
            MedidorSerie = Texto(fila, "MedidorSerie"),
            CalendarioId = Entero(fila, "CalendarioID"),
            LecturaId = Entero(fila, "LecturaID"),
            LecturaInicial = Entero(fila, "LecturaInicial"),
            LecturaFinal = Entero(fila, "LecturaFinal"),
            ConsumoM3 = Entero(fila, "ConsumoM3"),
            FechaCaptura = DateOnly.FromDateTime((DateTime)fila["FechaCaptura"])
        }, ct, Cadena("@MedidorSerie", 40, serie), DecimalSql("@CalendarioID", calendarioId))).Single();

    public async Task<object> GuardarLectura(string serie, long calendarioId, long lecturaFinal, CancellationToken ct) =>
        (await Consultar("dbo.app_Lectura_Guardar", fila => new
        {
            LecturaId = Entero(fila, "LecturaID"),
            MedidorSerie = Texto(fila, "MedidorSerie"),
            CalendarioId = Entero(fila, "CalendarioID"),
            LecturaInicial = Entero(fila, "LecturaInicial"),
            LecturaFinal = Entero(fila, "LecturaFinal"),
            ConsumoM3 = Entero(fila, "ConsumoM3"),
            LecturaFecha = DateOnly.FromDateTime((DateTime)fila["LecturaFecha"]),
            LecturaFechaHora = (DateTime)fila["LecturaFechaHora"],
            EsNueva = (bool)fila["EsNueva"]
        }, ct, Cadena("@MedidorSerie", 40, serie), DecimalSql("@CalendarioID", calendarioId),
            DecimalSql("@LecturaFinal", lecturaFinal))).Single();

    private async Task<List<T>> Consultar<T>(string procedimiento, Func<SqlDataReader, T> convertir,
        CancellationToken ct, params SqlParameter[] parametros)
    {
        await using var conexion = new SqlConnection(CadenaConexion());
        await conexion.OpenAsync(ct);
        await using var comando = new SqlCommand(procedimiento, conexion) { CommandType = CommandType.StoredProcedure };
        comando.Parameters.AddRange(parametros);
        await using var lector = await comando.ExecuteReaderAsync(ct);
        var filas = new List<T>();
        while (await lector.ReadAsync(ct))
            filas.Add(convertir(lector));

        return filas;
    }

    private string CadenaConexion()
    {
        var sql = configuracion.GetSection("SqlServer");
        var baseDatos = sql["BaseDatos"];
        var contrasena = sql["Contrasena"];
        if (string.IsNullOrWhiteSpace(baseDatos) || string.IsNullOrEmpty(contrasena))
            throw new SqlSinConfigurarException();

        return new SqlConnectionStringBuilder
        {
            DataSource = sql["Instancia"],
            InitialCatalog = baseDatos,
            UserID = sql["Usuario"],
            Password = contrasena,
            Encrypt = SqlConnectionEncryptOption.Mandatory,
            TrustServerCertificate = entorno.IsDevelopment() && sql.GetValue<bool>("ConfiarCertificado"),
            ConnectTimeout = 5
        }.ConnectionString;
    }

    private static SqlParameter Cadena(string nombre, int longitud, string valor) =>
        new(nombre, SqlDbType.VarChar, longitud) { Value = valor };

    private static SqlParameter DecimalSql(string nombre, long valor) =>
        new(nombre, SqlDbType.Decimal) { Precision = 10, Scale = 0, Value = (decimal)valor };

    private static string? Texto(SqlDataReader fila, string columna) =>
        fila[columna] is DBNull ? null : (string)fila[columna];

    private static long? Entero(SqlDataReader fila, string columna) =>
        fila[columna] is DBNull ? null : Convert.ToInt64(fila[columna]);
}

sealed record Lecturista(string Codigo, string? Nombre, string? Clave);
sealed class SqlSinConfigurarException : Exception;
