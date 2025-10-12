// src/PuppyDashboard.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dog, Utensils, Clock, AlertCircle, Calendar, Cloud } from 'lucide-react';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export default function PuppyDashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [walks, setWalks] = useState([]);
  const [meals, setMeals] = useState([]);
  const [showWalkAlert, setShowWalkAlert] = useState(false);
  const [weatherData, setWeatherData] = useState(null);

  const mainDocRef = doc(db, 'puppyData', 'main');

  useEffect(() => {
    const initDoc = async () => {
      const docSnap = await getDoc(mainDocRef);
      if (!docSnap.exists()) {
        await setDoc(mainDocRef, { walks: [], meals: [] });
      } else {
        const data = docSnap.data();
        setWalks(data.walks || []);
        setMeals(data.meals || []);
      }
    };
    initDoc();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await axios.get(
          'https://api.openweathermap.org/data/2.5/weather?q=Mölndal,SE&units=metric&appid=8ed355dd55f959fb0ec66d7d83b9852c'
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

  useEffect(() => {
    if (walks.length > 0) {
      const lastWalk = new Date(walks[walks.length - 1]);
      const hoursSince = (currentTime - lastWalk) / (1000 * 60 * 60);
      setShowWalkAlert(hoursSince >= 3);
    } else setShowWalkAlert(false);
  }, [currentTime, walks]);

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-US', { hour12: false });

  const getNextWalkTime = () => {
    if (walks.length === 0) return 'Add first walk';
    const last = new Date(walks[walks.length - 1]);
    const next = new Date(last.getTime() + 3 * 60 * 60 * 1000);
    return formatTime(next.toISOString());
  };

  const addWalk = async () => {
    const newWalks = [...walks, currentTime.toISOString()];
    setWalks(newWalks);
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
    setWalks(newWalks);
    await updateDoc(mainDocRef, { walks: newWalks });
  };

  const editWalk = async (i) => {
    const input = prompt('Edit walk time (HH:mm:ss):', formatTime(walks[i]));
    if (!input) return;
    const [h, m, s] = input.split(':').map(Number);
    const now = new Date();
    const updated = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
    const updatedWalks = [...walks];
    updatedWalks[i] = updated.toISOString();
    setWalks(updatedWalks);
    await updateDoc(mainDocRef, { walks: updatedWalks });
  };

  const deleteWalk = async (i) => {
    const updatedWalks = walks.filter((_, idx) => idx !== i);
    setWalks(updatedWalks);
    await updateDoc(mainDocRef, { walks: updatedWalks });
  };

  const addMeal = async () => {
    if (meals.length >= 3) return;
    const newMeals = [...meals, currentTime.toISOString()];
    setMeals(newMeals);
    await updateDoc(mainDocRef, { meals: newMeals });
  };

  const editMeal = async (i) => {
    const input = prompt('Edit meal time (HH:mm:ss):', formatTime(meals[i]));
    if (!input) return;
    const [h, m, s] = input.split(':').map(Number);
    const now = new Date();
    const updated = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
    const updatedMeals = [...meals];
    updatedMeals[i] = updated.toISOString();
    setMeals(updatedMeals);
    await updateDoc(mainDocRef, { meals: updatedMeals });
  };

  const deleteMeal = async (i) => {
    const updatedMeals = meals.filter((_, idx) => idx !== i);
    setMeals(updatedMeals);
    await updateDoc(mainDocRef, { meals: updatedMeals });
  };

  const resetDay = async () => {
    setWalks([]);
    setMeals([]);
    await updateDoc(mainDocRef, { walks: [], meals: [] });
  };

  return (
    <div className="min-h-screen w-screen bg-[#121212] text-white p-4 md:p-8 overflow-y-auto flex flex-col">
      <div className="flex-grow w-full space-y-6">

        {/* Header */}
        <div className="bg-[#121212] border border-white/70 p-6 flex justify-between items-center w-full">
          <div className="flex items-center gap-3">
            <Dog className="w-8 h-8 text-pink-400" />
            <div>
              <h1 className="text-3xl font-bold">Diza's Dashboard</h1>
              <p className="text-white/80">Puppy Care Tracker</p>
            </div>
          </div>
          <button onClick={resetDay} className="px-6 py-2 border border-white/70 hover:bg-white/10">
            Reset Day
          </button>
        </div>

        {/* Time / Date / Weather */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <div className="bg-[#121212] border border-white/70 p-6 flex flex-col items-center">
            <Clock className="w-6 h-6 mb-2 text-yellow-400" />
            <h2 className="font-semibold">Current Time</h2>
            <p className="text-3xl md:text-5xl font-bold">{currentTime.toLocaleTimeString()}</p>
          </div>

          <div className="bg-[#121212] border border-white/70 p-6 flex flex-col items-center">
            <Calendar className="w-6 h-6 mb-2 text-blue-400" />
            <h2 className="font-semibold">Today's Date</h2>
            <p className="text-2xl font-bold">
              {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="bg-[#121212] border border-white/70 p-6 flex flex-col items-center">
            <Cloud className="w-6 h-6 mb-2 text-cyan-400" />
            <h2 className="font-semibold">Weather</h2>
            {weatherData ? (
              <>
                <p className="text-2xl font-bold text-white">{Math.round(weatherData.main.temp)}°C</p>
                <p className="capitalize text-white">{weatherData.weather[0].description}</p>
                <p className="text-white">Humidity: {weatherData.main.humidity}%</p>
                <p className="text-white">Wind: {weatherData.wind.speed} m/s</p>
              </>
            ) : <p>Loading...</p>}
          </div>
        </div>

        {/* Walks / Meals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">

          {/* Walks */}
          <div className="bg-[#121212] border border-white/70 p-6 space-y-4 w-full">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Walks Today</h2>
              <span className="border border-white/70 px-4 py-2 font-bold">{walks.length}</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {walks.length === 0 ? (
                <p className="text-center py-2 text-white/80">No walks yet today</p>
              ) : (
                walks.map((w, i) => (
                  <div key={i} className="bg-[#121212] border border-white/70 p-2 flex justify-between items-center group">
                    <p>Diza ended her walk at {formatTime(w)}</p>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button onClick={() => editWalk(i)}>✏️</button>
                      <button onClick={() => deleteWalk(i)}>🗑️</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <p>Next walk: {getNextWalkTime()}</p>
            <div className="flex flex-col gap-2">
              <button onClick={addWalk} className="py-2 border border-white/70 hover:bg-white/10">Add Walk Now</button>
              <button onClick={addCustomWalk} className="py-2 border border-white/70 hover:bg-white/10">Add Walk (Custom)</button>
            </div>
          </div>

          {/* Meals */}
          <div className="bg-[#121212] border border-white/70 p-6 space-y-4 w-full">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center gap-2"><Utensils className="text-pink-400" /> Meals Today</h2>
              <span className="border border-white/70 px-4 py-2 font-bold">{meals.length} / 3</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {meals.length === 0 ? (
                <p className="text-center py-2 text-white/80">No meals yet today</p>
              ) : (
                meals.map((m, i) => (
                  <div key={i} className="bg-[#121212] border border-white/70 p-2 flex justify-between items-center group">
                    <p className="flex items-center gap-2"><Utensils className="w-4 h-4 text-pink-400" /> Diza ate at {formatTime(m)}</p>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button onClick={() => editMeal(i)}>✏️</button>
                      <button onClick={() => deleteMeal(i)}>🗑️</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={addMeal} disabled={meals.length >= 3} className={`py-2 border border-white/70 ${meals.length >= 3 ? 'text-gray-600 cursor-not-allowed' : 'hover:bg-white/10'}`}>Add Meal</button>
            </div>
          </div>
        </div>
      </div>

      {/* ⚠️ Walk alert */}
      {showWalkAlert && (
        <div className="mt-10 w-full bg-yellow-500/20 border-2 border-yellow-400 text-yellow-300 p-6 flex items-center justify-center gap-3 animate-pulse shadow-lg shadow-yellow-500/30 rounded-none">
          <AlertCircle className="w-8 h-8 text-yellow-300 animate-bounce" />
          <div className="text-center">
            <p className="font-extrabold text-2xl tracking-wide uppercase">Time for a walk!</p>
            <p className="text-sm text-yellow-200">It’s been over 3 hours since Diza’s last walk 🐾</p>
          </div>
        </div>
      )}
    </div>
  );
}
