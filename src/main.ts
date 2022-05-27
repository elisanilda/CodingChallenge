import { startServer } from "./sever";
import { connect } from "./config/typeorm";
import { libraryCron } from "./cron";

async function main() {
  connect();
  const port: number = 4000;
  const app = await startServer();
  app.listen(port);
  console.log("App running on port", port);

  libraryCron();
}

main();
