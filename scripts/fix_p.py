import os

files_to_fix = [
    'js/attendance.js',
    'js/admin-dashboard.js',
    'js/admin-waivers.js',
    'js/auth.js',
    'js/attendance_append.js',
    'js/profile.js',
    'js/projects.js',
    'js/students.js',
    'js/teachers.js',
    'js/groups.js'
]

def fix_encoding(content):
    # This function tries to undo the double-encoding
    # It takes a string that was incorrectly decoded as windows-1252 and then encoded as utf-8
    try:
        # Convert the "corrupted" string to bytes using windows-1252
        # This should give us the original UTF-8 bytes
        original_bytes = content.encode('windows-1252')
        # Now decode those bytes as UTF-8
        return original_bytes.decode('utf-8')
    except Exception:
        # If it fails, maybe it's partially fixed or has other issues
        return content

for file_path in files_to_fix:
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        fixed_content = fix_encoding(content)
        
        if fixed_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            print(f"Fixed {file_path}")
        else:
            print(f"No changes for {file_path}")
