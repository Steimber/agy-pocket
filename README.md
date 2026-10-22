# Agy Pocket

**Agy Pocket** es una Progressive Web App (PWA) mobile-first con interfaz estilo Claude Mobile para conectarte directamente al **Antigravity Desktop** abierto en tu PC desde tu teléfono (en casa por Wi-Fi o desde cualquier lugar vía **Vercel + Túnel Cloudflare cifrado**) con **sesión persistente de 90 días**.

---

## Características principales

- **Sesión persistente de 90 días**: Autenticación rápida por clave/PIN privado con token firmado HMAC-SHA256 almacenado tanto en cookie `HttpOnly` como en `localStorage` (`Authorization: Bearer`), evitando inicios de sesión repetitivos.
- **Puente Remoto Automático para Vercel (`AES-256-GCM`)**:
  - Podés desplegar la PWA en **Vercel** para tener un dominio HTTPS fijo en la pantalla de inicio de tu celular.
  - Al ejecutar `start-pocket.ps1` en tu PC, se levanta automáticamente un túnel seguro de Cloudflare y se publica la URL cifrada con `AES-256-GCM` (usando tus variables privadas `AGY_POCKET_SECRET` + `AGY_POCKET_PIN`) para que tu instancia de Vercel descubra tu PC sin tener que cambiar variables de entorno cada vez que prendas la PC.
- **Conexión directa en vivo (CDP + Transcript Stream)**:
  - Detecta automáticamente el puerto activo en `%APPDATA%\Antigravity\DevToolsActivePort`.
  - Inyecta tus mensajes directo en el editor Lexical de Antigravity Desktop y lee en vivo el razonamiento (`thinking`), herramientas (`tool_calls`) y respuestas desde `transcript.jsonl`.

---

## Configuración Privada (`.env.local` y Vercel)

Copiá `.env.example` a `.env.local` en tu PC (ignorado por Git) y cargá exactamente las mismas 3 variables privadas en el panel de **Environment Variables** de Vercel:

```env
AGY_POCKET_PIN=<tu-clave-privada>
AGY_POCKET_SECRET=<tu-secreto-aleatorio-de-64-chars>
AGY_BRIDGE_GIST_ID=<id-de-tu-gist-secreto>
```

---

## Cómo encender el puente en tu PC

1. Dejá **Antigravity Desktop** abierto en tu PC.
2. Ejecutá:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-pocket.ps1
```
