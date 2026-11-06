import zipfile, os

zip_path = 'vocalis-project.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        if any(skip in root for skip in ['node_modules', 'dist', '.git', '__pycache__', 'scripts']):
            continue
        for f in files:
            if f != zip_path:
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, '.'))
print("DONE")
