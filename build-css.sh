#!/bin/bash
# Build minified CSS
sed 's|/\*.*\*/||g' css/style.css | \
sed '/^[[:space:]]*$/d' | \
sed 's/[[:space:]]*{[[:space:]]*/{/g' | \
sed 's/[[:space:]]*}[[:space:]]*/}/g' | \
sed 's/[[:space:]]*:[[:space:]]*/:/g' | \
sed 's/[[:space:]]*;[[:space:]]*/;/g' | \
sed 's/[[:space:]]*,[[:space:]]*/,/g' | \
tr -d '\n' | \
sed 's/  */ /g' > css/style.min.css
echo "Original: $(wc -c < css/style.css) bytes"
echo "Minified: $(wc -c < css/style.min.css) bytes"
