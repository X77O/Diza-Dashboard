// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);