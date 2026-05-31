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

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@rannafy.u3mcpxw.mongodb.net/?appName=Rannafy`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});