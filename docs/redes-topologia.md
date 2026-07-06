# Topología de Red — Oficina Principal

## Segmentos de Red
- **10.0.1.0/24** — Oficinas administrativas (VLAN 10)
- **10.0.2.0/24** — Desarrollo y servidores internos (VLAN 20)
- **10.0.3.0/24** — DMZ / Servicios expuestos (VLAN 30)

## Gateways
- VLAN 10: 10.0.1.1 (Core Switch 1)
- VLAN 20: 10.0.2.1 (Core Switch 1)
- VLAN 30: 10.0.3.1 (Firewall)

## Reglas de Firewall
- Tráfico entrante a DMZ: solo puertos 80, 443, 22 desde IPs autorizadas.
- Tráfico desde VLAN 10 a VLAN 20: permitido solo en puertos 3306 (MySQL) y 5432 (PostgreSQL).
- Todo tráfico saliente pasa por proxy corporativo 10.0.0.10:3128.

## Diagnóstico rápido
Para verificar conectividad entre segmentos:
ping -c 4 10.0.2.1    # Desde VLAN 10 hacia core
traceroute 10.0.3.1    # Traza hacia el firewall