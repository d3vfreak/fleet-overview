FROM node:latest as build
WORKDIR app
#COPY data data
COPY tsconfig.json /app
COPY package.json /app
#FROM node:alpine
#WORKDIR app

#COPY --from=build /app/index.js /app
COPY static/package.json /app/static/package.json
#RUN cd static && npm install && npm run web install && rm -rf node_modules && cd .. && npm install --production
RUN cd static && npm install && npm run web install && rm -rf node_modules && cd ..

COPY index.ts /app
COPY static/assets/app.ts /app/static/assets/app.ts

RUN  npm install && npm run build && rm -rf node_modules

COPY static/assets/style.css /app/static/assets/style.css
COPY static/index.html /app/static/index.html

FROM node:alpine
COPY --from=build /app /app
WORKDIR app
RUN npm install --production
CMD ["node","index.js"]
EXPOSE 3000