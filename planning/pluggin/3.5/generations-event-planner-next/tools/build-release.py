#!/usr/bin/env python3
"""Build a versioned WordPress ZIP and update.json for an HTTPS release directory."""
import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile, ZIP_DEFLATED

SLUG = 'generations-event-planner-next'

def build(source, destination, base_url, changelog=''):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents:
        raise ValueError('Choose an output directory outside the plugin source.')
    url = urlsplit(base_url)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError('The release directory must be an HTTPS URL without credentials, query or fragment.')
    main = source / (SLUG + '.php')
    code = main.read_text()
    def header(name):
        match = re.search(r'^\s*\*\s*' + re.escape(name) + r':\s*(.+)$', code, re.M)
        if not match:
            raise ValueError('Missing plugin header: ' + name)
        return match.group(1).strip()
    version, requires, php = header('Version'), header('Requires at least'), header('Requires PHP')
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+){0,2}', version):
        raise ValueError('Use a numeric release version.')
    constant = re.search(r"define\('GAPNEXT_VERSION','([^']+)'\)", code)
    if not constant or constant.group(1) != version:
        raise ValueError('The plugin header and GAPNEXT_VERSION must match.')
    if not (source / 'includes/updater.php').is_file() or 'Update URI:' not in code:
        raise ValueError('The release must retain its native update support.')
    destination.mkdir(parents=True, exist_ok=True)
    filename = SLUG + '-' + version + '.zip'
    package = destination / filename
    if package.exists():
        raise ValueError('This release ZIP already exists. Use a new version or a clean output directory.')
    with ZipFile(package, 'w', ZIP_DEFLATED) as archive:
        for file in sorted(source.rglob('*')):
            relative = file.relative_to(source)
            if file.is_file() and not file.is_symlink() and not any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
                archive.write(file, str(Path(SLUG) / relative))
    feed = dict(slug=SLUG, version=version, requires=requires, requires_php=php,
                download_url=base_url.rstrip('/') + '/' + filename,
                sections=dict(description='<p>Generations AdventurePlex event inquiries and internal recommendations.</p>',
                              changelog='<p>' + html.escape(changelog or 'Version ' + version) + '</p>'))
    temporary = destination / 'update.json.tmp'
    temporary.write_text(json.dumps(feed, indent=2) + '\n')
    temporary.replace(destination / 'update.json')
    return package, destination / 'update.json'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--base-url', required=True, help='Published HTTPS directory shared by ZIP and update.json.')
    parser.add_argument('--changelog', default='')
    args = parser.parse_args()
    try:
        for artifact in build(args.source, args.output, args.base_url, args.changelog):
            print(artifact)
    except (ValueError, OSError) as error:
        parser.error(str(error))

if __name__ == '__main__':
    main()
