# Repository Guidelines

## Project Structure & Module Organization

This is a Python-based HTTP proxy tool that uses domain fronting to bypass network censorship. The project structure:

- `main.py` — Entry point, CLI argument parsing, and server initialization
- `proxy_server.py` — Local HTTP proxy server handling browser traffic
- `domain_fronter.py` — Core relay engine supporting multiple modes (custom domain, domain fronting, Google fronting, Apps Script)
- `mitm.py` — MITM certificate generation and SSL interception for HTTPS
- `cert_installer.py` — CA certificate installation utilities
- `h2_transport.py` — HTTP/2 multiplexing support for Apps Script relay
- `ws.py` — WebSocket tunnel implementation
- `Code.gs` — Google Apps Script relay (deployed separately)
- `ca/` — Generated CA certificates (ca.crt, ca.key) for MITM
- `config.json` — Runtime configuration (not committed, use config.example.json as template)

## Build, Test, and Development Commands

Install dependencies:
```bash
pip install -r requirements.txt
```

Run the proxy server:
```bash
python main.py
```

Run with custom config:
```bash
python main.py -c path/to/config.json
```

Override port:
```bash
python main.py -p 8080
```

Set log level:
```bash
python main.py --log-level DEBUG
```

## Coding Style & Naming Conventions

- **Python version:** 3.10+ required
- **Indentation:** 4 spaces (no tabs)
- **Line length:** Aim for 88-100 characters (Black-style)
- **Naming:**
  - Functions/variables: `snake_case`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
- **Type hints:** Use type annotations for function signatures
- **Docstrings:** Module-level docstrings required; function docstrings for complex logic
- **Imports:** Standard library first, then third-party, then local modules (separated by blank lines)
- **Async:** Use `async`/`await` for I/O operations; prefix async functions clearly

## Testing Guidelines

Currently, this project does not have automated tests. Manual testing workflow:

1. Configure `config.json` with valid credentials
2. Run `python main.py`
3. Configure browser proxy to `127.0.0.1:8085`
4. Test HTTP and HTTPS websites
5. Verify certificate installation for HTTPS
6. Check logs for errors at INFO or DEBUG level

When adding features, test all four relay modes: `custom_domain`, `domain_fronting`, `google_fronting`, and `apps_script`.

## Commit & Pull Request Guidelines

- **Commit messages:** Use clear, descriptive messages in imperative mood (e.g., "Add HTTP/2 support" not "Added HTTP/2 support")
- **Scope:** Keep commits focused on a single logical change
- **Branch naming:** Use descriptive names (e.g., `feature/http2-multiplexing`, `fix/ssl-handshake`)
- **Pull requests:**
  - Provide clear description of changes and motivation
  - Reference related issues if applicable
  - Test all relay modes before submitting
  - Update README.md if user-facing behavior changes

## Security & Configuration Tips

- **Never commit `config.json`** — it contains sensitive credentials (auth_key, script_id)
- **Never commit `ca/` directory** — contains private certificate keys
- **Change default AUTH_KEY** in Code.gs before deploying to Google Apps Script
- **Keep listen_host as 127.0.0.1** to prevent external access to the proxy
- **Verify SSL certificates** — set `verify_ssl: true` in production to prevent MITM attacks
- **Rotate credentials** if accidentally exposed

## Agent-Specific Instructions

When modifying code:
- Maintain async/await patterns consistently throughout the codebase
- Preserve the modular separation between proxy server, relay engine, and MITM components
- Update config.example.json if adding new configuration options
- Log important events at INFO level, debug details at DEBUG level
- Handle network errors gracefully with appropriate timeouts and retries
- Consider quota limits when modifying Apps Script relay logic (Google has daily quotas)
