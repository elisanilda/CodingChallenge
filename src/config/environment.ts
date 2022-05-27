import dotenv from "dotenv";

dotenv.config();

export const environment = {
  PORT: process.env.PORT,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_DATABASE: process.env.DB_DATABASE,
  JWT_SECRET: process.env.JWT_SECRET || "Default",
  LIBRARY_EMAIL: process.env.LIBRARY_EMAIL,
  APP_EMAIL_USER: process.env.APP_EMAIL_USER,
  APP_EMAIL_PASS: process.env.APP_EMAIL_PASS,
  APP_SMTP_SERVER: process.env.APP_SMTP_SERVER,
};
