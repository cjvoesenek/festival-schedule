FROM alpine:latest

RUN apk add ncftp
COPY upload.sh /upload.sh

ENTRYPOINT ["/upload.sh"]
