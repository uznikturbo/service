from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent / "email_templates"


def render(template_name: str, **kwargs) -> str:
    path = TEMPLATES_DIR / f"{template_name}.html"
    html = path.read_text(encoding="utf-8")

    if "used_parts" in kwargs:
        parts = kwargs.pop("used_parts") or []
        if parts:
            tags_html = ""
            for part in parts:
                tags_html += (
                    '<td style="padding-right:8px;padding-bottom:6px;">'
                    '<table cellpadding="0" cellspacing="0" border="0"><tr>'
                    '<td style="background-color:#1a1200;border:1px solid #332200;padding:4px 10px;">'
                    f'<span style="font-family:\'Courier New\',Courier,monospace;font-size:11px;color:#F5A623;">{part}</span>'
                    "</td></tr></table></td>"
                )
            html = html.replace(
                '<td style="padding-right:8px;padding-bottom:6px;">\n                          <table cellpadding="0" cellspacing="0" border="0">\n                            <tr>\n                              <td style="background-color:#1a1200;border:1px solid #332200;padding:4px 10px;">\n                                <span style="font-family:\'Courier New\',Courier,monospace;font-size:11px;color:#F5A623;">{{part_1}}</span>\n                              </td>\n                            </tr>\n                          </table>\n                        </td>\n                        <!-- Repeat above <td> block for each part via template engine -->',
                tags_html,
            )
        else:
            html = html.replace(
                "{{part_1}}", "—"
            )

    for key, value in kwargs.items():
        html = html.replace(f"{{{{{key}}}}}", str(value))

    return html
