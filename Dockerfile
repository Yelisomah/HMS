FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build -- --configuration production

FROM nginx:alpine

COPY --from=builder /app/dist/hms /usr/share/nginx/html

EXPOSE 4200

CMD ["nginx", "-g", "daemon off;"]


