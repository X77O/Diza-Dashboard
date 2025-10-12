// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Replace these values with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBYbE5S9WJYvJFMsE9poZtftrZ6EGwhyW4",
  authDomain: "diza-fa827.firebaseapp.com",
  projectId: "diza-fa827",
  storageBucket: "diza-fa827.firebasestorage.app",
  messagingSenderId: "778607842233",
  appId: "1:778607842233:web:bca084ad894e24751f5c68",
  measurementId: "G-YS9H7G7DYD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);
