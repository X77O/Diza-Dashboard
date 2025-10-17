import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Utensils, Cloud, Bone, CalendarDays, PawPrint, Edit } from 'lucide-react'; 
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection as firestoreCollection, getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';

// Helper function to map OpenWeatherMap icons to weather emojis, with night mode check
const getWeatherEmoji = (icon) => {
    const isNight = icon.endsWith('n');
    
    // Icon codes mapping to emojis
    if (['01d', '01n'].includes(icon)) return isNight ? '🌙' : '☀️'; // clear sky
    if (['02d', '02n'].includes(icon)) return isNight ? '☁️' : '🌤️'; // few clouds
    if (['03d', '03n'].includes(icon)) return '☁️'; // scattered clouds
    if (['04d', '04n'].includes(icon)) return '🌥️'; // broken clouds
    if (['09d', '09d'].includes(icon)) return '🌧️'; // shower rain
    if (['10d', '10n'].includes(icon)) return '🌦️'; // rain
    if (['11d', '11n'].includes(icon)) return '🌩️'; // thunderstorm
    if (['13d', '13n'].includes(icon)) return '❄️'; // snow
    if (['50d', '50n'].includes(icon)) return '🌫️'; // mist
    return '❓'; // default
};

export default function PuppyDashboard() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [walks, setWalks] = useState([]);
    const [meals, setMeals] = useState([]);
    const [snacks, setSnacks] = useState([]);
    const [weatherData, setWeatherData] = useState(null);

    // Initial state changed to null to clearly indicate "loading"
    const [availableDates, setAvailableDates] = useState(null); 
    const [lastVisibleDate, setLastVisibleDate] = useState(null);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isHistoryMode, setIsHistoryMode] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const collectionName = 'puppyData';
    const mainDocRef = doc(db, collectionName, 'main');
    const historyCollectionRef = firestoreCollection(db, collectionName);
    
    // --- IMPORTANT: Ensure this API key variable is available via .env in your project root ---
    const API_KEY = process.env.REACT_APP_WEATHER_API_KEY; 
    
    // Coordinates for Mölndal, SE
    const LAT = 57.65;
    const LON = 12.03;

    // Dates must be defined here to reflect the current moment
    const today = new Date();
    const todayStr = today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    // --- Helpers ---
    const formatTime = (t) => {
        if (!t) return '';
        const d = typeof t === 'string' ? new Date(t) : new Date(t.time || t);
        return isNaN(d.getTime()) ? String(t) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    const formatDate = (d) =>
        d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const sortByTime = (arr) => {
        return arr.slice().sort((a,b) => {
            const ta = new Date(a.time || a);
            const tb = new Date(b.time || b);
            return ta - tb;
        });
    };

    const getDocRefForDate = async (date) => {
        const dateKey = date.toDateString() === todayStr 
            ? 'main'
            : date.toISOString().split('T')[0];
            
        const docRef = doc(db, collectionName, dateKey);
        
        const snap = await getDoc(docRef);
        if (!snap.exists() && dateKey !== 'main') {
            await setDoc(docRef, { walks: [], meals: [], snacks: [] });
        }
        
        return docRef;
    };


    // =========================================================================
    // --- Weather Data Fetching ---
    // =========================================================================
    useEffect(() => {
        if (!API_KEY) {
            console.error("OpenWeatherMap API Key is missing. Check your .env file.");
            // Optionally set a friendly error message in state here
            return;
        }

        const fetchWeather = async () => {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric`;
            try {
                const response = await axios.get(url);
                setWeatherData(response.data);
            } catch (error) {
                console.error("Error fetching weather data:", error);
                // Set an empty object or specific error state to stop "Loading..."
                setWeatherData({}); 
            }
        };

        // Fetch immediately and then set an interval for updates (e.g., every 10 minutes)
        fetchWeather();
        const intervalId = setInterval(fetchWeather, 600000); // 10 minutes (10 * 60 * 1000 ms)

        return () => clearInterval(intervalId); // Cleanup on unmount
    }, [API_KEY]); 

    // =========================================================================
    // --- History Loading Logic ---
    // =========================================================================
    const loadHistoryDates = useCallback(async (isInitialLoad = true) => {
        const historyLimit = 15;
        
        let currentDates = new Set();
        if (!isInitialLoad && availableDates) {
            currentDates = new Set(availableDates);
        }

        let baseQuery = query(
            historyCollectionRef, 
            orderBy("__name__", "desc"), 
            limit(historyLimit)
        );

        if (!isInitialLoad && lastVisibleDate) {
            baseQuery = query(
                historyCollectionRef, 
                orderBy("__name__", "desc"),
                startAfter(lastVisibleDate),
                limit(historyLimit)
            );
        }

        try {
            const querySnapshot = await getDocs(baseQuery);
            let lastDocKey = null;

            querySnapshot.docs.forEach(d => {
                const docId = d.id;
                if (docId.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    currentDates.add(new Date(docId).toDateString());
                    lastDocKey = docId;
                }
            });
            
            currentDates.add(todayStr);
            currentDates.add(yesterdayStr);

            const sortedDates = Array.from(currentDates)
                .map(d => new Date(d))
                .filter(d => !isNaN(d.getTime()))
                .sort((a, b) => b - a)
                .map(d => d.toDateString());

            setAvailableDates(sortedDates);
            setLastVisibleDate(lastDocKey);
            
            setHasMoreHistory(querySnapshot.docs.length >= historyLimit);

        } catch (error) {
            console.error("Error fetching history dates:", error);
            if (availableDates === null) {
                setAvailableDates([todayStr, yesterdayStr].filter(d => !isNaN(new Date(d).getTime())).sort((a, b) => new Date(b) - new Date(a)));
            }
            setHasMoreHistory(false);
        }
    }, [historyCollectionRef, lastVisibleDate, availableDates, todayStr, yesterdayStr]); 


    // =========================================================================
    // --- Clock & Auto-Update ---
    // =========================================================================
    useEffect(() => {
        let lastDay = new Date().getDate();
        const t = setInterval(() => {
            const now = new Date();
            setCurrentTime(now);

            if (now.getDate() !== lastDay) {
                console.log("Day changed. Reloading 'Today' page.");
                setSelectedDate(now);
                loadHistoryDates(true); 
                lastDay = now.getDate();
            }
        }, 1000);
        
        return () => clearInterval(t);
    }, [loadHistoryDates]); 


    // --- Initial History Load ---
    useEffect(() => {
        loadHistoryDates(true);
    }, [loadHistoryDates]);


    // --- Load selected date content ---
    const loadForDate = async (date) => {
        setEditMode(false);
        const dateStr = date.toDateString();

        if (dateStr === todayStr) {
            setIsHistoryMode(false);
            const snap = await getDoc(mainDocRef);
            if (snap.exists()) {
                const data = snap.data();
                setWalks(sortByTime(data.walks || []));
                setMeals(data.meals || []);
                setSnacks(data.snacks || []);
            } else {
                 // Initialize 'main' doc if it doesn't exist
                await setDoc(mainDocRef, { walks: [], meals: [], snacks: [] });
                setWalks([]);
                setMeals([]);
                setSnacks([]);
            }
            return;
        }

        setIsHistoryMode(true);
        // Firestore document IDs are YYYY-MM-DD
        const dateKey = date.toISOString().split('T')[0];
        const dateDocRef = doc(db, collectionName, dateKey);
        const snap = await getDoc(dateDocRef);
        if (snap.exists()) {
            const data = snap.data();
            setWalks(sortByTime(data.walks || []));
            setMeals(data.meals || []);
            setSnacks(data.snacks || []);
        } else {
            // If historical date document doesn't exist, show empty log
            setWalks([]);
            setMeals([]);
            setSnacks([]);
        }
    };

    useEffect(() => {
        loadForDate(selectedDate);
    }, [selectedDate]);

    // --- Live sync for today ---
    useEffect(() => {
        if (selectedDate.toDateString() !== todayStr) return;
        const unsub = onSnapshot(mainDocRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            setWalks(sortByTime(data.walks || []));
            setMeals(data.meals || []);
            setSnacks(data.snacks || []);
        });
        return () => unsub();
    }, [selectedDate, todayStr]);

    // --- CRUD functions (Simplified with helper function) ---
    const refresh = async () => loadForDate(selectedDate);

    const handleAction = async (updateData, isNewDoc = false) => {
        const docRef = await getDocRefForDate(selectedDate);
        await updateDoc(docRef, updateData);
        // If a new historical document was created (not 'main'), refresh the history list
        if (isNewDoc && selectedDate.toDateString() !== todayStr) {
            loadHistoryDates(true); 
        }
        refresh();
    }
    
    // --- Action Handlers ---
    const addWalk = async () => {
        const newWalk = { time: new Date().toISOString() };
        const snap = await getDoc(await getDocRefForDate(selectedDate));
        const current = snap.exists() ? snap.data().walks || [] : [];
        await handleAction({ walks: sortByTime([...current, newWalk]) }, true);
    };

    const addCustomWalk = async () => {
        const timeInput = prompt('Enter custom walk time (HH:mm:ss):');
        if (!timeInput) return;
        const [h, m, s] = timeInput.split(':').map(Number);
        const now = new Date();
        const customTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m||0, s||0).toISOString();
        const snap = await getDoc(await getDocRefForDate(selectedDate));
        const current = snap.exists() ? snap.data().walks || [] : [];
        await handleAction({ walks: sortByTime([...current, {time:customTime}]) }, true);
    };

    const addMeal = async () => {
        const weight = prompt('Enter the weight (grams):');
        if (weight === null || isNaN(parseInt(weight)) || parseInt(weight) <= 0) return alert('Invalid weight!');
        const newMeal = { time: new Date().toISOString(), weight: parseInt(weight) };
        const snap = await getDoc(await getDocRefForDate(selectedDate));
        const current = snap.exists() ? snap.data().meals || [] : [];
        await handleAction({ meals: [...current, newMeal] }, true);
    };

    const addSnack = async () => {
        const type = prompt('Enter snack type:');
        if (!type) return;
        const qty = prompt('Enter quantity:');
        if (!qty || isNaN(parseInt(qty)) || parseInt(qty) <= 0) return alert('Invalid quantity!');
        const newSnack = { time: new Date().toISOString(), type, quantity: parseInt(qty) };
        const snap = await getDoc(await getDocRefForDate(selectedDate));
        const current = snap.exists() ? snap.data().snacks || [] : [];
        await handleAction({ snacks: [...current, newSnack] }, true);
    };

    const editEntry = async (i, type, promptMsg, updateFn) => {
        const docRef = await getDocRefForDate(selectedDate);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const current = snap.data()[type] || [];
        const old = current[i];
        
        const input = prompt(promptMsg, old[Object.keys(old).find(k => k !== 'time' && k !== 'date')] || '');
        if (!input) return;
        
        const updatedEntry = updateFn(old, input);
        if (!updatedEntry) return;

        current[i] = updatedEntry;
        await handleAction({ [type]: type === 'walks' ? sortByTime(current) : current });
    };

    const editWalk = (i) => editEntry(i, 'walks', 'Edit time (HH:mm:ss):', (old, input) => {
        const [h, m, s] = input.split(':').map(Number);
        const date = new Date(old.time || old);
        const updatedTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m||0, s||0).toISOString();
        return { ...old, time: updatedTime };
    });

    const editMeal = (i) => editEntry(i, 'meals', 'Edit weight (grams):', (old, input) => {
        const weightNum = parseInt(input);
        if (isNaN(weightNum) || weightNum <= 0) { alert('Invalid weight!'); return null; }
        return { ...old, weight: weightNum };
    });

    const editSnack = (i) => editEntry(i, 'snacks', 'Edit snack type/quantity (Type,Qty):', (old, input) => {
        const parts = input.split(',');
        const type = parts[0].trim();
        const qtyNum = parseInt(parts[1]?.trim());
        if (!type || isNaN(qtyNum) || qtyNum <= 0) { alert('Invalid input!'); return null; }
        return { ...old, type, quantity: qtyNum };
    });

    const deleteEntry = async (i, type) => {
        if (!window.confirm(`Are you sure you want to delete this ${type.slice(0, -1)} entry?`)) return;
        const docRef = await getDocRefForDate(selectedDate);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const current = snap.data()[type] || [];
        current.splice(i,1);
        await handleAction({ [type]: current });
    };

    const resetDay = async () => {
        if (!window.confirm("Are you sure you want to reset ALL data for this day? This action is irreversible.")) return;
        await handleAction({ walks: [], meals: [], snacks: [] });
    };
    
    // Calculates the time for the next walk (3 hours after the last one)
    const getNextWalkTime = () => {
        if (!walks.length) return 'Add first walk';
        const last = new Date(walks[walks.length-1].time || walks[walks.length-1]);
        const next = new Date(last.getTime() + 3 * 60 * 60 * 1000);
        return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // Checks if the previous walk was 3 or more hours ago
    const isWalkDue = () => {
        if (isHistoryMode) return false;
        if (!walks.length) return true;
        const last = new Date(walks[walks.length-1].time || walks[walks.length-1]);
        const hours = (currentTime - last) / (1000 * 60 * 60);
        return hours >= 3;
    };


    return (
        <div className="flex w-screen h-screen bg-black text-white overflow-hidden">
            
            {/* Sidebar (History Panel) */}
            <div className={`absolute top-0 bottom-0 w-48 bg-black border-r border-white/20 z-20 
                transform transition-transform duration-300 overflow-y-auto 
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                <div className="flex justify-between items-center p-2 border-b border-white/20 sticky top-0 bg-black">
                     <p className="font-bold text-lg">History</p>
                     <button onClick={() => setIsSidebarOpen(false)} className="text-xl button p-1">X</button>
                </div>
                
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 100px)' }}>
                    
                    {/* Check if loading */}
                    {availableDates === null && (
                        <p className="p-2 text-center text-gray-500">Loading history...</p>
                    )}

                    {/* Check if loaded and empty (should rarely happen since today is always added) */}
                    {availableDates !== null && availableDates.length === 0 && (
                        <p className="p-2 text-center text-gray-500">No past logs found.</p>
                    )}
                    
                    {/* Display Dates */}
                    {availableDates !== null && availableDates.map((d) => (
                        <div
                            key={d}
                            className={`p-2 text-center cursor-pointer hover:bg-white/10 border-b border-white/10 text-sm ${d===selectedDate.toDateString()?'bg-white/20 font-bold':''}`}
                            onClick={()=>{
                                setSelectedDate(new Date(d));
                                setIsSidebarOpen(false);
                            }}
                        >
                            {/* Check if date is Today or Yesterday for better display */}
                            {d === todayStr ? 'TODAY' : d === yesterdayStr ? 'YESTERDAY' : d}
                        </div>
                    ))}
                    
                    {/* Only show Load More if there are potentially more documents to load */}
                    {hasMoreHistory && availableDates !== null && availableDates.length > 0 && (
                         <div className="p-2 pt-2">
                            <button onClick={() => loadHistoryDates(false)} className="button w-full">
                                Load More Days
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-col flex-1 p-2 gap-2 overflow-hidden">
                {/* Top: Date & Weather (Height set to flex-grow with max height) */}
                <div className="flex-1 flex gap-2" style={{ maxHeight: '45%' }}>
                    
                    {/* Clock / Date Display (Border: border border-white/20) */}
                    <div className="flex-1 flex flex-col justify-center border border-white/20 p-4 text-center bg-black">
                        {isHistoryMode ? (
                            // Increased history mode font size
                            <p className="text-[clamp(1.5rem,8vw,3rem)] font-bold text-yellow-400">
                                Viewing history for {formatDate(selectedDate)}
                            </p>
                        ) : (
                            <>
                                {/* Increased clock font size */}
                                <p className="text-[clamp(3rem,12vw,6rem)] font-bold">{currentTime.toLocaleTimeString()}</p>
                                {/* Increased date font size */}
                                <p className="text-[clamp(1.5rem,6vw,2.5rem)] text-gray-300">{formatDate(currentTime)}</p>
                            </>
                        )}
                    </div>
                    
                    {/* Weather Card (Mölndal) (Border: border border-white/20) */}
                    <div className="flex-1 flex flex-col justify-center border border-white/20 p-4 text-center bg-black">
                        <p className="text-[clamp(1rem,4vw,1.5rem)] mb-2 font-semibold">Mölndal, SE</p>
                        <div className="flex items-center justify-center gap-4 mb-2">
                            {/* Increased emoji size significantly */}
                            <p className="text-[clamp(3rem,12vw,7rem)]"> 
                                {weatherData && weatherData.weather ? getWeatherEmoji(weatherData.weather[0].icon) : '❓'}
                            </p>
                            {/* Increased temperature font size significantly */}
                            <p className="text-[clamp(2rem,10vw,5rem)] font-bold">
                                {weatherData && weatherData.main ? `${Math.round(weatherData.main.temp)}°C` : 'Loading...'}
                            </p>
                        </div>
                        {/* Increased description font size */}
                        {weatherData && weatherData.weather && <p className="capitalize text-[clamp(1rem,4vw,1.5rem)] text-gray-300">{weatherData.weather[0].description}</p>}
                        
                        {/* Increased details font size */}
                        {weatherData && weatherData.main && <p className="text-[clamp(0.9rem,3vw,1.2rem)] text-gray-400 mt-1">Hum: {weatherData.main.humidity}% | Wind: {weatherData.wind.speed} m/s</p>}
                        
                        {/* Show an error if weatherData is an empty object (from the catch block) */}
                        {weatherData === {} && <p className="text-red-400 text-sm">Error loading weather.</p>}
                    </div>
                </div>

                {/* Middle: Next Walk Alert / Controls (Border: border border-white/20) */}
                <div className="flex items-center justify-between p-3 border border-white/20 text-xl bg-black" style={{ flex: '0 0 auto' }}>
                    
                    {/* Left Control Group (Calendar & Edit) */}
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="w-10 h-10 flex items-center justify-center cursor-pointer border border-white/20 button p-0"
                        >
                            <CalendarDays className="text-white/70 w-6 h-6" />
                        </button>

                        <button 
                            onClick={()=>setEditMode(!editMode)} 
                            className={`w-10 h-10 flex items-center justify-center cursor-pointer border button p-0 
                                ${editMode ? 'bg-indigo-600 border-indigo-600 hover:bg-indigo-700' : 'border-white/20'}`}
                        >
                            <Edit className="w-5 h-5" />
                        </button>

                        <p className={`${isWalkDue() ? 'walk-due-alert text-yellow-400' : 'text-green-400'} font-bold text-xl`}>
                            {isWalkDue() ? 'Time for a walk! 🐾' : `Next walk at: ${getNextWalkTime()}`}
                        </p>
                    </div>
                    
                    {/* Right Control Group (Reset Button) */}
                    {(!isHistoryMode && walks.length > 0) && (
                        <button onClick={resetDay} className="button border-red-500 text-red-400 hover:bg-red-900/50 text-sm">Reset Today</button>
                    )}
                </div>

                {/* Bottom: Walks, Meals, Snacks (Log Cards) - Height set to flex-grow with max height */}
                <div className="flex-1 flex gap-2 overflow-hidden" style={{ maxHeight: '50%' }}>
                    {/* Walks Card (UPDATED BORDER: border border-white/20) */}
                    <div className="flex-1 flex flex-col border border-white/20 p-2 overflow-hidden bg-black">
                        <p className="font-bold mb-2 text-center text-xl border-b border-white/20 pb-1">Walks ({walks.length})</p>
                        <div className="flex-1 overflow-y-auto">
                            {walks.map((w,i)=>(
                                <div key={i} className="flex items-center justify-between mb-2 text-base p-1 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-2 truncate">
                                        <PawPrint className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                                        <p className="truncate">Diza ended her walk at <span className="font-bold text-white">{formatTime(w.time||w)}</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button onClick={()=>editWalk(i)} className="button p-1 text-sm">✏️</button>
                                            <button onClick={()=>deleteEntry(i,'walks')} className="button p-1 text-sm">🗑️</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {walks.length === 0 && <p className="text-center text-gray-400 mt-4 text-base">No walks logged for this day.</p>}
                        </div>
                        {(!isHistoryMode || editMode) && (
                            <div className="flex gap-2 mt-2 pt-2 border-t border-white/20">
                                <button onClick={addWalk} className="button flex-1 bg-green-700 hover:bg-green-600">Add Walk Now</button>
                                <button onClick={addCustomWalk} className="button flex-1">Add Custom Time</button>
                            </div>
                        )}
                    </div>

                    {/* Meals Card (UPDATED BORDER: border border-white/20) */}
                    <div className="flex-1 flex flex-col border border-white/20 p-2 overflow-hidden bg-black">
                        <p className="font-bold mb-2 text-center text-xl border-b border-white/20 pb-1">Meals ({meals.length})</p>
                        <div className="flex-1 overflow-y-auto">
                            {meals.map((m,i)=>(
                                <div key={i} className="flex items-center justify-between mb-2 text-base p-1 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-2 truncate">
                                        <Utensils className="w-5 h-5 text-pink-400 flex-shrink-0" />
                                        <p className="truncate">Diza ate meal at <span className="font-bold text-white">{formatTime(m.time)}</span> - <span className="font-bold text-white">{m.weight}g</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button onClick={()=>editMeal(i)} className="button p-1 text-sm">✏️</button>
                                            <button onClick={()=>deleteEntry(i,'meals')} className="button p-1 text-sm">🗑️</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {meals.length === 0 && <p className="text-center text-gray-400 mt-4 text-base">No meals logged for this day.</p>}
                        </div>
                        {(!isHistoryMode || editMode) && (
                            <button onClick={addMeal} className="button mt-2 pt-2 border-t border-white/20 bg-pink-700 hover:bg-pink-600">Add Meal</button>
                        )}
                    </div>

                    {/* Snacks Card (UPDATED BORDER: border border-white/20) */}
                    <div className="flex-1 flex flex-col border border-white/20 p-2 overflow-hidden bg-black">
                        <p className="font-bold mb-2 text-center text-xl border-b border-white/20 pb-1">Snacks ({snacks.length})</p>
                        <div className="flex-1 overflow-y-auto">
                            {snacks.map((s,i)=>(
                                <div key={i} className="flex items-center justify-between mb-2 text-base p-1 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-2 truncate">
                                        <Bone className="w-5 h-5 text-orange-400 flex-shrink-0" />
                                        <p className="truncate">Diza ate <span className="font-bold text-white">{s.quantity} x {s.type}</span> at <span className="font-bold text-white">{formatTime(s.time)}</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button onClick={()=>editSnack(i)} className="button p-1 text-sm">✏️</button>
                                            <button onClick={()=>deleteEntry(i,'snacks')} className="button p-1 text-sm">🗑️</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {snacks.length === 0 && <p className="text-center text-gray-400 mt-4 text-base">No snacks logged for this day.</p>}
                        </div>
                        {(!isHistoryMode || editMode) && (
                            <button onClick={addSnack} className="button mt-2 pt-2 border-t border-white/20 bg-orange-700 hover:bg-orange-600">Add Snack</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}