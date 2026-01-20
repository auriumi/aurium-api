import app from "./server";

const PORT: number = 4000;

app.listen(PORT, () => {
  console.log("Server is running on port 4000");
});
