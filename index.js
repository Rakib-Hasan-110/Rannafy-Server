const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello spicy RannaFy! 🚀");
});

app.listen(port, () => {
  console.log(`Server running : ${port}`);
});