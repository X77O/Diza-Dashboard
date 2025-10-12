// src/PuppyDashboard.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Utensils, Cloud } from 'lucide-react';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';

export default function PuppyDashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [walks, setWalks] = useState([]);
  const [meals, setMeals] = useState([]);
  const [weatherData, setWeatherData] = useState(null);

  const mainDocRef = doc(db, 'puppyData', 'main');
  const API_KEY = process.env.REACT_APP_WEATHER_API_KEY;

  // Initialize and listen to Firebase doc
  useEffect(() => {
    const init = async () => {
      const docSnap = await getDoc(mainDocRef);
      if (!docSnap.exists()) {
        await setDoc(mainDocRef, { walks: [], meals: [] });
      }
    };
    init();

    const unsubscribe = onSnapshot(mainDocRef, (docSnap) => {
      const data = docSnap.data();
      if (data) {
        setWalks(data.walks || []);
        setMeals(data.meals || []);
      }
    });

    return () => unsubscribe();
  }, []);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch weather
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        if (!API_KEY) return;
        const res = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?q=Mölndal,se&appid=${API_KEY}&units=metric`
        );
        setWeatherData(res.data);
      } catch (err) {
        console.error('Failed to fetch weather:', err);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-US', { hour12: false });

  const formatDate = (date) =>
    date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

  const getNextWalkTime = () => {
    if (walks.length === 0) return 'Add first walk';
    const last = new Date(walks[walks.length - 1]);
    const next = new Date(last.getTime() + 3 * 60 * 60 * 1000);
    return formatTime(next.toISOString());
  };

  const isWalkDue = () => {
    if (walks.length === 0) return true;
    const last = new Date(walks[walks.length - 1]);
    const hoursSince = (currentTime - last) / (1000 * 60 * 60);
    return hoursSince >= 3;
  };

  const editEntry = async (i, type) => {
    const arr = type === 'walk' ? walks : meals;
    const input = prompt('Edit time (HH:mm:ss):', formatTime(arr[i]));
    if (!input) return;
    const [h, m, s] = input.split(':').map(Number);
    const now = new Date();
    const updatedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
    const updatedArr = [...arr];
    updatedArr[i] = updatedTime.toISOString();
    await updateDoc(mainDocRef, type === 'walk' ? { walks: updatedArr } : { meals: updatedArr });
  };

  const deleteEntry = async (i, type) => {
    const arr = type === 'walk' ? walks : meals;
    const updatedArr = arr.filter((_, idx) => idx !== i);
    await updateDoc(mainDocRef, type === 'walk' ? { walks: updatedArr } : { meals: updatedArr });
  };

  const addWalk = async () => {
    const newWalks = [...walks, currentTime.toISOString()];
    await updateDoc(mainDocRef, { walks: newWalks });
  };

  const addCustomWalk = async () => {
    const input = prompt('Enter walk time (HH:mm:ss):');
    if (!input) return;
    const [h, m, s] = input.split(':').map(Number);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return alert('Invalid time!');
    const now = new Date();
    const custom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
    const newWalks = [...walks, custom.toISOString()];
    await updateDoc(mainDocRef, { walks: newWalks });
  };

  const addMeal = async () => {
    if (meals.length >= 3) return;
    const newMeals = [...meals, currentTime.toISOString()];
    await updateDoc(mainDocRef, { meals: newMeals });
  };

  const resetDay = async () => {
    await updateDoc(mainDocRef, { walks: [], meals: [] });
  };

  return (
    <div className="flex flex-col w-screen h-screen p-2 gap-2">

      {/* Top section: Date+Time & Weather */}
      <div className="flex-1 flex gap-2">
        {/* Date+Time */}
        <div className="flex-1 flex flex-col justify-center border border-white/20 p-4 text-center">
          <p className="text-[clamp(1rem,6vw,3rem)] font-bold">{currentTime.toLocaleTimeString()}</p>
          <p className="text-[clamp(0.8rem,4vw,1.5rem)]">{formatDate(currentTime)}</p>
        </div>

        {/* Weather */}
        <div className="flex-1 flex flex-col justify-center border border-white/20 p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Cloud className="w-10 h-10 text-cyan-400" />
            <p className="text-[clamp(1rem,5vw,2.5rem)] font-bold">{weatherData ? Math.round(weatherData.main.temp) + '°C' : 'Loading...'}</p>
          </div>
          {weatherData && (
            <p className="text-[clamp(0.8rem,3vw,1rem)]">Humidity: {weatherData.main.humidity}% | Wind: {weatherData.wind.speed} m/s</p>
          )}
          {weatherData && (
            <p className="capitalize text-[clamp(0.8rem,3vw,1rem)]">{weatherData.weather[0].description}</p>
          )}
        </div>
      </div>

      {/* Next Walk / Alert */}
      <div className="flex items-center justify-between p-2 border border-white/20 text-xl">
        <p className={`${isWalkDue() ? 'text-yellow-400 font-bold' : ''}`}>
          {isWalkDue() ? 'Time for a walk! 🐾' : `Next walk at: ${getNextWalkTime()}`}
        </p>
        <button onClick={resetDay} className="border border-white/20 px-3 py-1">Reset Day</button>
      </div>

      {/* Walks & Meals */}
      <div className="flex-1 flex gap-2">
        {/* Walks */}
        <div className="flex-1 flex flex-col border border-white/20 p-2 overflow-auto">
          <p className="font-bold mb-1 text-center">Walks ({walks.length})</p>
          <div className="flex-1 overflow-auto">
            {walks.map((w,i) => (
              <div key={i} className="flex items-center justify-between mb-1">
                <p>Diza ended her walk at {formatTime(w)}</p>
                <div className="flex gap-1">
                  <button onClick={()=>editEntry(i,'walk')} className="button">✏️</button>
                  <button onClick={()=>deleteEntry(i,'walk')} className="button">🗑️</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            <button onClick={addWalk} className="button flex-1">Add Walk</button>
            <button onClick={addCustomWalk} className="button flex-1">Add Custom</button>
          </div>
        </div>

        {/* Meals */}
        <div className="flex-1 flex flex-col border border-white/20 p-2 overflow-auto">
          <p className="font-bold mb-1 text-center">Meals ({meals.length}/3)</p>
          <div className="flex-1 overflow-auto">
            {meals.map((m,i) => (
              <div key={i} className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Utensils className="w-6 h-6 text-pink-400" />
                  <p>Diza ate at {formatTime(m)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>editEntry(i,'meal')} className="button">✏️</button>
                  <button onClick={()=>deleteEntry(i,'meal')} className="button">🗑️</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addMeal} disabled={meals.length>=3} className="button mt-1">Add Meal</button>
        </div>
      </div>
    </div>
  );
}
