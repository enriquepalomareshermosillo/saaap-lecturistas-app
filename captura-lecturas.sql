CREATE OR ALTER PROCEDURE dbo.app_Calendario_ListarAbiertos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CalendarioID, CalendarioNombre
    FROM dbo.Calendario
    WHERE CalendarioCerrar = 0
    ORDER BY CalendarioNombre, CalendarioID;
END;
GO

CREATE OR ALTER PROCEDURE dbo.app_Lectura_ObtenerCaptura
    @MedidorSerie VARCHAR(40),
    @CalendarioID DECIMAL(10, 0)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @LecturaInicial DECIMAL(10, 0),
            @LecturaID DECIMAL(10, 0),
            @LecturaFinal DECIMAL(10, 0),
            @LecturasVigentes BIGINT;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.Calendario
        WHERE CalendarioID = @CalendarioID AND CalendarioCerrar = 0
    )
        THROW 51001, N'El calendario no existe o está cerrado.', 1;

    SELECT @LecturaInicial = MedidorLecturaInicial
    FROM dbo.Medidor
    WHERE MedidorSerie = @MedidorSerie;

    IF @@ROWCOUNT = 0
        THROW 51002, N'El medidor no existe.', 1;

    IF @LecturaInicial IS NULL
        THROW 51003, N'El medidor no tiene lectura inicial.', 1;

    SELECT @LecturasVigentes = COUNT_BIG(*),
           @LecturaID = MAX(LecturaID),
           @LecturaFinal = MAX(LecturaFinal)
    FROM dbo.Lectura
    WHERE MedidorSerie = @MedidorSerie
      AND CalendarioID = @CalendarioID
      AND LecturaCancelado = 0;

    IF @LecturasVigentes > 1
        THROW 51004, N'Hay más de una lectura vigente para el medidor y calendario.', 1;

    SELECT @MedidorSerie AS MedidorSerie,
           @CalendarioID AS CalendarioID,
           @LecturaID AS LecturaID,
           @LecturaInicial AS LecturaInicial,
           @LecturaFinal AS LecturaFinal,
           @LecturaFinal - @LecturaInicial AS ConsumoM3,
           CONVERT(DATE, GETDATE()) AS FechaCaptura;
END;
GO

CREATE OR ALTER PROCEDURE dbo.app_Lectura_Guardar
    @MedidorSerie VARCHAR(40),
    @CalendarioID DECIMAL(10, 0),
    @LecturaFinal DECIMAL(10, 0)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @LecturaFinal IS NULL
        THROW 51005, N'Captura la lectura final.', 1;

    DECLARE @LecturaInicial DECIMAL(10, 0),
            @LecturaID DECIMAL(10, 0),
            @LecturasVigentes BIGINT,
            @FechaHora DATETIME,
            @EsNueva BIT;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Mantiene abierto el calendario durante el guardado.
        IF NOT EXISTS (
            SELECT 1 FROM dbo.Calendario WITH (HOLDLOCK)
            WHERE CalendarioID = @CalendarioID AND CalendarioCerrar = 0
        )
            THROW 51001, N'El calendario no existe o está cerrado.', 1;

        -- Dos guardados que pasan por este SP se serializan por medidor.
        SELECT @LecturaInicial = MedidorLecturaInicial
        FROM dbo.Medidor WITH (UPDLOCK, HOLDLOCK)
        WHERE MedidorSerie = @MedidorSerie;

        IF @@ROWCOUNT = 0
            THROW 51002, N'El medidor no existe.', 1;

        IF @LecturaInicial IS NULL
            THROW 51003, N'El medidor no tiene lectura inicial.', 1;

        IF @LecturaFinal < @LecturaInicial
            THROW 51006, N'La lectura final debe ser mayor o igual a la lectura inicial.', 1;

        SELECT @LecturasVigentes = COUNT_BIG(*),
               @LecturaID = MAX(LecturaID)
        FROM dbo.Lectura
        WHERE MedidorSerie = @MedidorSerie
          AND CalendarioID = @CalendarioID
          AND LecturaCancelado = 0;

        IF @LecturasVigentes > 1
            THROW 51004, N'Hay más de una lectura vigente para el medidor y calendario.', 1;

        SET @FechaHora = GETDATE();
        SET @EsNueva = IIF(@LecturaID IS NULL, 1, 0);

        IF @EsNueva = 1
        BEGIN
            INSERT INTO dbo.Lectura (
                MedidorSerie, LecturaInicial, LecturaFinal, LecturaFecha,
                LecturaFechaHora, LecturaCancelado, CalendarioID
            )
            VALUES (
                @MedidorSerie, @LecturaInicial, @LecturaFinal, CONVERT(DATE, @FechaHora),
                @FechaHora, 0, @CalendarioID
            );

            SET @LecturaID = CONVERT(DECIMAL(10, 0), SCOPE_IDENTITY());
        END
        ELSE
        BEGIN
            UPDATE dbo.Lectura
            SET LecturaInicial = @LecturaInicial,
                LecturaFinal = @LecturaFinal,
                LecturaFecha = CONVERT(DATE, @FechaHora),
                LecturaFechaHora = @FechaHora
            WHERE LecturaID = @LecturaID AND LecturaCancelado = 0;

            IF @@ROWCOUNT <> 1
                THROW 51007, N'La lectura cambió durante la captura. Vuelve a cargarla.', 1;
        END;

        COMMIT TRANSACTION;

        SELECT @LecturaID AS LecturaID,
               @MedidorSerie AS MedidorSerie,
               @CalendarioID AS CalendarioID,
               @LecturaInicial AS LecturaInicial,
               @LecturaFinal AS LecturaFinal,
               @LecturaFinal - @LecturaInicial AS ConsumoM3,
               CONVERT(DATE, @FechaHora) AS LecturaFecha,
               @FechaHora AS LecturaFechaHora,
               @EsNueva AS EsNueva;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
END;
GO
