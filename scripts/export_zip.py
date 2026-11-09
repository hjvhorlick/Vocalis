"""Export the application source/assets, never local secrets or user voice files."""
from pathlib import Path
import argparse
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIRECTORIES = {'src', 'public', 'docs', 'scripts', 'tests'}
FILES = {'README.md', 'package.json', 'bun.lock', 'package-lock.json', 'index.html',
         'tsconfig.json', 'vite.config.ts', 'server.ts', '.gitignore', '.env.example',
         'metadata.json', 'LICENSE', 'LICENSE.txt'}
PRIVATE_SUFFIXES = {'.vproject', '.vvoice', '.zip', '.pem', '.key', '.pyc'}


def export_archive(output: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(ROOT.rglob('*')):
            relative = item.relative_to(ROOT)
            if item.is_symlink() or not item.is_file() or any(parent.is_symlink() for parent in item.parents if parent != ROOT):
                continue
            if relative.parts[0] not in DIRECTORIES and str(relative) not in FILES:
                continue
            if any(part.startswith('.') or part in {'node_modules', '__pycache__', 'dist'} for part in relative.parts) and str(relative) not in FILES:
                continue
            if item.suffix.lower() in PRIVATE_SUFFIXES or item.name.startswith('.env') and item.name != '.env.example':
                continue
            archive.write(item, str(relative))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / '.cache' / 'vocalis-project.zip')
    export_archive(parser.parse_args().output)
    print('Source archive ready')
