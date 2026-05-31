// Import dependencies
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(`${process.env.STRIPE_KEY}`);
// firebase-admin auth
const admin = require("firebase-admin");
const serviceAccount = require("./rannafy-firebase-adminsdk.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Create app
const app = express();
const port = process.env.PORT || 3000;

//Middleware
app.use(express.json());
app.use(cors());

// jwt verifactions
const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorised access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorised access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@rannafy.u3mcpxw.mongodb.net/?appName=Rannafy`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const database = client.db("RannaFy");
    const usersCollection = database.collection("users");
    const mealsCollection = database.collection("meals");
    const mealsReviewsCollection = database.collection("mealsReviews");
    const favoritesCollection = database.collection("favorites");
    const requestsCollection = database.collection("requests");
    const ordersCollection = database.collection("orders");
    const paymentCollection = database.collection("payments");
    const counterCollection = database.collection("counters");

    const getNextChefId = async () => {
      const chefPera = await counterCollection.findOne({ _id: "chefId" });
      chefPera.seq = chefPera.seq + 1;
      const counter = await counterCollection.updateOne(
        { _id: "chefId" },
        { $set: chefPera },
      );
      console.log("counter", counter);
      const number = String(chefPera.seq).padStart(3, "0");
      return `CHEF_${number}`;
    };
    // must be used after verifyFBToken middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyChef = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "chef") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // users data into Database
    // get user from database
    app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      try {
        const cursor = usersCollection.find(query).sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });
    app.get("/users/email", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.get("/users/:email/role", verifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.userStatus = "active";
      user.createdAt = new Date();

      // exists user checking
      const userExists = await usersCollection.findOne({ email: user.email });
      if (userExists) {
        return res.send({ message: "User Exists" });
      }
      const result = await usersCollection.insertOne(user);
      console.log("result", result);

      res.send(result);
    });
    app.patch(
      "/users/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      },
    );
    app.get(
      "/admin-stats",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const orders = await ordersCollection.find().toArray();
        const users = await usersCollection.find().toArray();

        const paidOrders = orders.filter((o) => o.paymentStatus === "paid");

        const totalPayment = paidOrders.reduce(
          (sum, o) => sum + o.price * Number(o.quantity),
          0,
        );

        const deliveredOrders = orders.filter(
          (o) => o.orderStatus === "delivered",
        ).length;

        const pendingOrders = orders.filter(
          (o) => o.orderStatus !== "delivered",
        ).length;

        console.log(totalPayment, deliveredOrders, pendingOrders);

        res.send({
          totalPayment,
          totalUsers: users.length,
          deliveredOrders,
          pendingOrders,
        });
      },
    );

    // requests
    app.post("/requests", async (req, res) => {
      try {
        const request = req.body;

        if (!request.userEmail || !request.requestType) {
          return res.status(400).send({ message: "Invalid request data" });
        }

        const reqExists = await requestsCollection.findOne({
          userEmail: request.userEmail,
          requestType: request.requestType,
        });

        if (reqExists) {
          return res.status(409).send({
            message: "Already requested!",
          });
        }

        const result = await requestsCollection.insertOne(request);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Request failed" });
      }
    });
    // get request
    app.get("/requests", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await requestsCollection
        .find(query)
        .sort({ requestTime: -1 })
        .toArray();
      res.send(result);
    });

    app.patch(
      "/requests/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const requestId = req.params.id;
        const { action } = req.body;

        const requestQuery = { _id: new ObjectId(requestId) };
        const request = await requestsCollection.findOne(requestQuery);

        console.log("request", request);

        if (!request) {
          return res.status(404).send({ message: "Request not found" });
        }

        if (request.requestStatus !== "pending") {
          return res.send({ message: "Already processed" });
        }

        // reject
        if (action === "reject") {
          const result = await requestsCollection.updateOne(requestQuery, {
            $set: { requestStatus: "rejected" },
          });

          return res.send({ success: true, type: "rejected", result });
        }

        // accept
        if (action === "accept") {
          const userQuery = { email: request.userEmail };

          if (request.requestType === "chef") {
            const chefId = await getNextChefId();

            console.log("chefId", chefId, userQuery);

            await usersCollection.updateOne(userQuery, {
              $set: {
                role: "chef",
                chefId,
              },
            });
          }

          if (request.requestType === "admin") {
            await usersCollection.updateOne(userQuery, {
              $set: { role: "admin" },
            });
          }

          const result = await requestsCollection.updateOne(requestQuery, {
            $set: { requestStatus: "approved" },
          });

          return res.send({ success: true, type: "approved", result });
        }
      },
    );
    // Meals data from MongoDB
    app.get("/meals", async (req, res) => {
      try {
        const {
          search = "",
          sort = "none",
          page = 1,
          limit = 12,
          email,
        } = req.query;

        let query = {};

        if (email) {
          query.chefEmail = email;
        }

        if (search) {
          query.$or = [
            { foodName: { $regex: search, $options: "i" } },
            { chefName: { $regex: search, $options: "i" } },
          ];
        }

        let sortQuery = {};
        if (sort === "low") sortQuery.price = 1;
        if (sort === "high") sortQuery.price = -1;

        const skip = (Number(page) - 1) * Number(limit);

        const meals = await mealsCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        const total = await mealsCollection.countDocuments(query);

        res.send({
          meals,
          total,
        });
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });
