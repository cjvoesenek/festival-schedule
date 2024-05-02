#!/bin/sh

echo "Username: ${INPUT_USERNAME}"
echo "Password: ${INPUT_PASSWORD}"
for file in ${INPUT_FILES}; do
    echo "Uploading ${file} to ftp.deds.nl/www"
    ncftpput -u "${INPUT_USERNAME}" -p "${INPUT_PASSWORD}" ftp.deds.nl /www "${file}"
done
