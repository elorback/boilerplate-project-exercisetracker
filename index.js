const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const parse = require("body-parser");
const mongoose = require("mongoose");
mongoose.connect(process.env.mongo_uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = mongoose.Schema({
  username: String,
});
const User = mongoose.model("User", userSchema);

// Exercise Schema
const ExerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Reference to User
  description: String,
  duration: Number,
  date: Date,
});
const Exercise = mongoose.model("Exercise", ExerciseSchema);

// Log Schema
const LogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Reference to User
  count: { type: Number, default: 0 }, // Count of exercises
  log: [{ description: String, duration: Number, date: Date }], // List of exercises
});
const Log = mongoose.model("Log", LogSchema);

app.use(parse.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// POST /api/users
app.post("/api/users", async (req, res) => {
  let { username } = req.body;
  try {
    let newUser = new User({ username });
    let saved = await newUser.save();
    return res.json({ username: saved.username, _id: saved._id });
  } catch (er) {
    return res.status(500).json({ error: "could not create user" });
  }
});

// GET /api/users
app.get("/api/users", async (req, res) => {
  try {
    let users = await User.find({});
    return res.json(users);
  } catch (er) {
    return res.status(500).json({ error: "Could not find users" });
  }
});

// POST /api/users/:_id/exercises
app.post("/api/users/:_id/exercises", async (req, res) => {
  const { _id } = req.params;
  const { description, duration, date } = req.body;

  const handledDate = !date ? new Date() : new Date(date);

  try {
    const user = await User.findById(_id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Create new exercise
    const newExercise = new Exercise({
      userId: user._id, // Add userId reference
      description,
      duration: parseInt(duration),
      date: handledDate,
    });

    const savedExercise = await newExercise.save();

    // Update the log with the new exercise
    await Log.findOneAndUpdate(
      { userId: user._id }, // Match by userId
      {
        $inc: { count: 1 }, // Increment the count
        $push: {
          log: {
            description: savedExercise.description,
            duration: savedExercise.duration,
            date: savedExercise.date.toDateString(),
          },
        }, // Push new exercise to log
      },
      { new: true, upsert: true } // Create log if it doesn't exist
    );

    return res.json({
      _id: user._id,
      username: user.username,
      description: savedExercise.description,
      duration: savedExercise.duration,
      date: savedExercise.date.toDateString(),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to save exercise" });
  }
});

// GET /api/users/:_id/logs
app.get("/api/users/:_id/logs", async (req, res) => {
  const { _id } = req.params;
  const { from, to, limit } = req.query; // Get query parameters

  try {
    const log = await Log.findOne({ userId: _id }); // Find the log by userId
    if (!log)
      return res.status(404).json({ error: "No logs found for this user" });

    const user = await User.findById(_id); // Get username for response

    // Initialize date filters
    let fromDate = from ? new Date(from) : new Date(0); // Default to epoch if no from date
    let toDate = to ? new Date(to) : new Date(); // Default to now if no to date

    // Filter log entries based on date range
    const filteredLog = log.log.filter((entry) => {
      const entryDate = new Date(entry.date); // Convert string date to Date object
      return entryDate >= fromDate && entryDate <= toDate;
    });

    // Limit the number of logs returned
    const limitedLog = limit
      ? filteredLog.slice(0, parseInt(limit))
      : filteredLog;

    // Format the logs for response
    const formattedLog = limitedLog.map((entry) => ({
      description: entry.description,
      duration: entry.duration,
      date: entry.date.toDateString(), // Convert date to string
    }));

    return res.json({
      _id: user._id,
      username: user.username,
      count: formattedLog.length,
      log: formattedLog, // Use the formatted log
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to retrieve logs" });
  }
});

const listener = app.listen(process.env.PORT || 3030, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
