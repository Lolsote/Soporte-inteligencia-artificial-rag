# Manual de Servicios Críticos

## Servidores de Aplicación

### API Gateway (192.168.1.10)
- Puerto: 443
- Health check: GET /health
- Logs: /var/log/api-gateway/access.log

### Base de Datos Principal (192.168.1.20)
- Motor: PostgreSQL 15
- Puerto: 5432
- DB: soporte_produccion
- Backup: 03:00 UTC diario (retención 30 días)

### Redis Cache (192.168.1.30)
- Puerto: 6379
- Uso: sesiones de usuario y rate limiting

## Verificación de estado
systemctl status postgresql-15
netstat -tlnp | grep 5432
redis-cli ping
curl -k https://192.168.1.10/health

## Procedimiento de reinicio seguro
1. Notificar a usuarios con 5 min de anticipación
2. Detener tráfico en el balanceador
3. Ejecutar: sudo systemctl restart <servicio>
4. Verificar health check
5. Reabrir tráfico