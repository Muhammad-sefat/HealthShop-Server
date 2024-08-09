const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://healthshop-972b1.web.app",
    "https://healthshop-972b1.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

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
    const joinusCollection = client.db("HealthShop").collection("joinUs");
    const testimonialCollection = client
      .db("HealthShop")
      .collection("testimonial");

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price * 100);
      if (!price || amount < 1)
        return res.status(400).send({ error: "Invalid price" });

      try {
        const { client_secret } = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: client_secret });
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

    // get user data by email from usersCollection
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // get all user from database
    app.get("/user", async (req, res) => {
      const user = await usersCollection.find().toArray();
      res.send(user);
    });

    // update use role
    app.put("/user/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedRole = req.body.role;

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: updatedRole } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).send("Failed to update role");
      }
    });

    // delete user
    app.delete("/user/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send("Failed to delete user");
      }
    });

    // get all medicine
    app.get("/allmedicine", async (req, res) => {
      const { sort, search } = req.query;
      const query = {};

      // Search by name or company name
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { company: { $regex: search, $options: "i" } },
        ];
      }

      // Sorting by price
      let sortOption = {};
      if (sort === "asc") {
        sortOption = { price: 1 }; // Ascending order
      } else if (sort === "desc") {
        sortOption = { price: -1 }; // Descending order
      }

      const data = await medicineCollection
        .find(query)
        .sort(sortOption)
        .toArray();
      res.send(data);
    });

    // get all category medicine
    app.get("/allcategory", async (req, res) => {
      const data = await categoryCollection.find().toArray();
      res.send(data);
    });

    // get all testimonials
    app.get("/testimonial", async (req, res) => {
      const data = await testimonialCollection.find().toArray();
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
          return res.status(400).send({ error: "Product already in cart" });
        }

        delete product._id;
        const result = await cartCollection.insertOne({
          ...product,
          quantity: 1,
        });
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding product to cart:", error);
        res.status(500).send({ error: "Failed to add product to cart" });
      }
    });

    // update item
    app.put("/update-cart-item", async (req, res) => {
      const { email, name, quantityChange } = req.body;
      const query = { email, name };

      try {
        const updatedProduct = await cartCollection.updateOne(query, {
          $inc: { quantity: quantityChange },
        });

        if (updatedProduct.modifiedCount > 0) {
          return res.status(200).send({ message: "Product quantity updated" });
        } else {
          return res.status(400).send({ error: "Product not found in cart" });
        }
      } catch (error) {
        console.error("Error updating product quantity:", error);
        res.status(500).send({ error: "Failed to update product quantity" });
      }
    });

    // get all medicine by email
    app.get("/cart/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const products = await cartCollection.find({ email }).toArray();
        console.log(products);
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

    app.get("/discount-products", async (req, res) => {
      try {
        const query = { discount: { $exists: true } };
        const discountProducts = await medicineCollection.find(query).toArray();
        res.status(200).send(discountProducts);
      } catch (error) {
        console.error("Error fetching discount products:", error);
        res.status(500).send({ error: "Failed to fetch discount products" });
      }
    });

    // update modal and save in database
    app.put("/medicine/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };

      const result = await medicineCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Delete medicine by ID
    app.delete("/medicine/:id", async (req, res) => {
      try {
        const { id } = req.params;
        await medicineCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: "Medicine deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error deleting medicine", error });
      }
    });

    // Add Medicine in database
    app.post("/medicine", verifyToken, async (req, res) => {
      try {
        const medicineData = req.body;
        const result = await medicineCollection.insertOne(medicineData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving medicine data:", error);
        res.status(500).send("Error saving medicine data");
      }
    });

    // save community data
    app.post("/join-us", async (req, res) => {
      const { name, email, phone, role, message } = req.body;
      try {
        await joinusCollection.insertOne({
          name,
          email,
          phone,
          role,
          message,
          joinedAt: new Date(),
        });
        res.status(201).send({ message: "Thank you for joining us!" });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Something went wrong. Please try again later." });
      }
    });

    // get data by email
    app.get("/api/medicines", async (req, res) => {
      const email = req.query.email;
      try {
        const query = { email: email };
        const medicines = await medicineCollection.find(query).toArray();

        res.status(200).json(medicines);
      } catch (error) {
        console.error("Error fetching medicines:", error);
        res.status(500).send("Error fetching medicines");
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
