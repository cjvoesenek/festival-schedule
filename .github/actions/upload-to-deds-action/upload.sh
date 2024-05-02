#!/bin/sh

for file in ${INPUT_FILES}; do
    ncftpput -u "${INPUT_USERNAME}" -p "${INPUT_PASSWORD}" ftp.deds.nl /www "${file}"
done
