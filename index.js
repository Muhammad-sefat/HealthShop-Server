const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
require("dotenv").config();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dbn21dt.mongodb.net/?appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("HealthShop").collection("users");
    const medicineCollection = client.db("HealthShop").collection("medicine");
    const categoryCollection = client.db("HealthShop").collection("category");
    const cartCollection = client.db("HealthShop").collection("cartproduct");
    const paymentsCollection = client.db("HealthShop").collection("payment");

    //create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price) * 100;
      if (!price || amount < 1)
        return res.status(400).send({ error: "Invalid price" });

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // save user data in database
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExist = await usersCollection.findOne({ email: user?.email });
      if (isExist) {
        return res.send(isExist);
      }
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get all medicine
    app.get("/allmedicine", async (req, res) => {
      const data = await medicineCollection.find().toArray();
      res.send(data);
    });

    // get all category medicine
    app.get("/allcategory", async (req, res) => {
      const data = await categoryCollection.find().toArray();
      res.send(data);
    });

    // Route to fetch medicines by category
    app.get("/medicines/:category", async (req, res) => {
      const category = req.params.category;
      try {
        const medicines = await medicineCollection.find({ category }).toArray();
        res.status(200).json(medicines);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch medicines" });
      }
    });

    // save cart medicine in database
    app.put("/add-to-cart", async (req, res) => {
      const product = req.body;
      const query = { email: product.email, name: product.name };

      try {
        const existingProduct = await cartCollection.findOne(query);

        if (existingProduct) {
          const updatedProduct = await cartCollection.updateOne(query, {
            $inc: { quantity: 1 },
          });
          return res.send(updatedProduct);
        }
        delete product._id;
        const result = await cartCollection.insertOne({
          ...product,
          quantity: 1,
        });
        res.send(result);
      } catch (error) {
        console.error("Error adding product to cart:", error);
        res.status(500).send({ error: "Failed to add product to cart" });
      }
    });

    // get all medicine by email
    app.get("/cart/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const products = await cartCollection.find({ email }).toArray();
        res.send(products);
      } catch (error) {
        console.error("Error fetching cart data:", error);
        res.status(500).send({ error: "Failed to fetch cart data" });
      }
    });

    // get total cart medicine
    app.get("/cart", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // Backend - Clear all items from the cart for a specific user
    app.delete("/cart/clear", async (req, res) => {
      const { email } = req.query;

      try {
        const result = await cartCollection.deleteMany({ email });
        res.send({ message: "All items removed from cart", result });
      } catch (error) {
        console.error("Error clearing cart:", error);
        res.status(500).send({ error: "Failed to clear cart" });
      }
    });

    // Backend - Delete a single item from the cart
    app.delete("/cart/item/:id", async (req, res) => {
      const { id } = req.params;
      const { email } = req.query;

      try {
        const result = await cartCollection.deleteOne({
          _id: new ObjectId(id),
          email: email,
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Item not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error deleting cart item:", error);
        res.status(500).send({ error: "Failed to delete cart item" });
      }
    });

    // update quentity
    app.put("/cart/update-quantity", async (req, res) => {
      const { email, _id, quantity } = req.body;
      try {
        const result = await cartCollection.updateOne(
          { email, _id: new ObjectId(_id) },
          { $set: { quantity } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).send({ error: "Failed to update quantity" });
      }
    });

    // save payment data in paymentCollection
    app.post("/payment", async (req, res) => {
      const body = req.body;
      try {
        const result = await paymentsCollection.insertOne(body);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to save payment info" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is full runing");
});
app.listen(port, () => {
  console.log(`Server is runing from ${port}`);
});
