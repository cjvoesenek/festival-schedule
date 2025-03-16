#!/bin/sh

for file in ${INPUT_FILES}; do
    echo "Uploading \"${file}\"..."
    USERNAME=$(echo -n "$INPUT_USERNAME" | tr -d '\r' | tr -d '\n')
    PASSWORD=$(echo -n "$INPUT_PASSWORD" | tr -d '\r' | tr -d '\n')
    echo $(echo -n "${PASSWORD}" | wc -c)
    ncftpls -m -R -u "${USERNAME}" -p "${PASSWORD}" ftp://ftp.deds.nl
    ncftpput -m -R -u "${USERNAME}" -p "${PASSWORD}" ftp.deds.nl /www "${file}"
done
