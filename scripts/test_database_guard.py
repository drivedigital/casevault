"""Validate destructive test targets before importing the application or connecting."""
import os
import re
from urllib.parse import unquote, urlsplit


def require_disposable_database(url: str | None) -> str:
    if not url:
        raise ValueError('Set TEST_DATABASE_URL explicitly to a disposable database; no application fallback')
    parsed = urlsplit(url)
    name = unquote(parsed.path.lstrip('/'))
    if not parsed.scheme.startswith('postgresql') or not parsed.hostname or parsed.query or parsed.fragment:
        raise ValueError('Test database requires a PostgreSQL URL without query/fragment overrides')
    if not re.fullmatch(r'(?:[a-zA-Z0-9]+_)*(?:test|ci)(?:_[a-zA-Z0-9]+)*', name):
        raise ValueError('Destructive tests require a database name containing a test or ci segment')
    return url


if __name__ == '__main__':
    require_disposable_database(os.environ.get('TEST_DATABASE_URL'))
    print('Disposable test database target validated')
