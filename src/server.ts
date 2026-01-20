import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

//get requests
app.get("/", (req: Request, res: Response) => {
  res.send("Server is running..");
});

app.get("/test", (req: Request, res: Response) => {
  console.log("get request recieved, sending response..")

  res.json({
    message: "Request works.."
  });
});

//post requests
app.post("/api/submit", (req: Request, res: Response) => {
  console.log("post request recieved, sending response..")
  
  try {

    // if (!req.body) {
    //   return res.status(400).send("invalid request");
    // }

    //log data
    console.log(req.body);
    
    return res.json({
      status: "Success",
    });

  } catch (err) {
    console.log(`err: ${err}`);

    res.status(500).send("server error nyae");
  }
});

export default app;
