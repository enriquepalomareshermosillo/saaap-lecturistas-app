CREATE OR ALTER PROCEDURE dbo.app_Lectura_ResumenCalendario
    @CalendarioID DECIMAL(10, 0)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Calendario
        WHERE CalendarioID = @CalendarioID AND CalendarioCerrar = 0
    )
        THROW 51001, N'El calendario no existe o está cerrado.', 1;

    -- Cuenta una vez cada medidor aunque tenga varias lecturas vigentes.
    WITH MedidoresLeidos AS (
        SELECT DISTINCT MedidorSerie
        FROM dbo.Lectura
        WHERE CalendarioID = @CalendarioID AND LecturaCancelado = 0
    )
    SELECT @CalendarioID AS CalendarioID,
           COUNT_BIG(*) AS MedidoresActivos,
           COUNT_BIG(l.MedidorSerie) AS ConLectura,
           COUNT_BIG(*) - COUNT_BIG(l.MedidorSerie) AS Pendientes
    FROM dbo.Medidor AS m
    LEFT JOIN MedidoresLeidos AS l ON l.MedidorSerie = m.MedidorSerie
    WHERE m.MedidorCancelado = 0;
END;
GO
