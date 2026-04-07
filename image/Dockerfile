FROM node:lts AS build

WORKDIR /build
COPY src/ ./src
COPY schedules/ ./schedules
COPY index.html package*.json tsconfig.json .

RUN npm ci
RUN npx vite build --base=/

FROM nginx:stable-alpine

COPY image/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/dist /www
