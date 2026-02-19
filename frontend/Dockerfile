# Этап 1: Сборка
FROM node:18-alpine as build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# URL бэкенда передаётся при сборке через build arg
# По умолчанию — обращаемся к /api (nginx будет проксировать)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Этап 2: Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
