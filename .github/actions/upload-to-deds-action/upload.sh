#!/bin/sh

for file in ${INPUT_FILES}; do
    echo "Uploading \"${file}\"..."
    ncftpput -R -u "${INPUT_USERNAME}" -p "${INPUT_PASSWORD}" ftp.deds.nl /www "${file}"
done
