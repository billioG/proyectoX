import os
import re

file_path = 'js/profile.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix stars in loadTeacherProfile with flexible regex
pattern1 = r"\$\{'⭐'\.repeat\(Math\.round\(parseFloat\(avgRating\)\)\)\}\s*\+?\s*\$\{' '.*repeat\(5 - Math\.round\(parseFloat\(avgRating\)\)\)\}"
replacement1 = "${'⭐'.repeat(Math.round(parseFloat(avgRating)))}${Array(5 - Math.round(parseFloat(avgRating))).fill('<span style=\"opacity: 0.3;\">⭐</span>').join('')}"
new_content = re.sub(pattern1, replacement1, content)

# If no change, try even more flexible
if new_content == content:
    pattern1 = r"\$\{'⭐'\.repeat\(Math\.round\(parseFloat\(avgRating\)\)\)\}.*?repeat\(5 - Math\.round\(parseFloat\(avgRating\)\)\)\}"
    new_content = re.sub(pattern1, replacement1, content)

# Fix stars in viewAllTeacherComments
pattern2 = r"\$\{'⭐'\.repeat\(r\.rating\)\}.*?repeat\(5 - r\.rating\)\}"
replacement2 = "${'⭐'.repeat(r.rating)}${Array(5 - r.rating).fill('<span style=\"opacity: 0.2;\">⭐</span>').join('')}"
new_content = re.sub(pattern2, replacement2, new_content)

# Fix recent comments
pattern3 = r"<span style=\"font-size: 1\.1rem;\">\$\{'⭐'\.repeat\(r\.rating\)\}<\/span>"
replacement3 = "<span style=\"font-size: 1.1rem;\">${'⭐'.repeat(r.rating)}${Array(5 - r.rating).fill('<span style=\"opacity: 0.2;\">⭐</span>').join('')}</span>"
new_content = re.sub(pattern3, replacement3, new_content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

if new_content != content:
    print("Fixed stars via flexible Python script")
else:
    print("No matches found for stars")
