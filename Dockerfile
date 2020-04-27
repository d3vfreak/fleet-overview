FROM node:latest as build
WORKDIR app
#COPY data data
COPY index.ts /app
COPY static /app/static
COPY tsconfig.json /app
COPY package.json /app
RUN npm install && npm run build && cd static  &&npm install && npm run web install && rm -rf node_modules
FROM node:alpine
WORKDIR app
COPY --from=build /app/index.js /app
COPY --from=build /app/static /app/static
COPY --from=build /app/package.json /app
RUN npm install --production
CMD ["node","index.js"] 
EXPOSE 80
