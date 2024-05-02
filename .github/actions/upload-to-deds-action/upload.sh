#!/bin/sh

for file in ${INPUT_FILES}; do
    echo "Uploading \"${file}\" to \"ftp.deds.nl/www/${file}\"..."
    ncftpput -u "${INPUT_USERNAME}" -p "${INPUT_PASSWORD}" ftp.deds.nl /www "${file}"
done
