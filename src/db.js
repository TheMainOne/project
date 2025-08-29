// src/db.js
import mongoose from "mongoose";

/** Возвращает хэндлы коллекций через текущее соединение mongoose */
export function collections() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo not connected yet");
  return {
    Channels: db.collection("channels"),
    SessionsGlobal: db.collection("sessions_global"),
    SessionsPair: db.collection("sessions_pair"),
    Messages: db.collection("messages"),
  };
}
