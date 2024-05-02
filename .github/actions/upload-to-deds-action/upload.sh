#!/bin/sh

for file in ${FILES}; do
    ncftpput -u "${USERNAME}" -p "${PASSWORD}" ftp.deds.nl /www "${file}"
done
