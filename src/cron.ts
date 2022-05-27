import { LibraryReport } from "./reports/libraryReport";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { environment } from "./config/environment";

export const libraryCron = async () => {
  cron.schedule("* * * * * *", () => {
    const report = new LibraryReport();

    let transporter = nodemailer.createTransport({
      host: environment.APP_SMTP_SERVER,
      port: 587,
      secure: false,
      auth: {
        user: environment.APP_EMAIL_USER,
        pass: environment.APP_EMAIL_PASS,
      },
    });

    let result = transporter.sendMail({
      from: environment.APP_EMAIL_USER,
      to: environment.LIBRARY_EMAIL,
      subject: "Library summary",
      html: report.toHTML(),
    });
  });
};
