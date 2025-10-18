import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Utensils, Bone, CalendarDays, PawPrint, Edit } from 'lucide-react'; 
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
    
    const API_KEY = process.env.REACT_APP_WEATHER_API_KEY; 
    
    // Coordinates for Mölndal, SE
    const LAT = 57.65;
    const LON = 12.03;

    const today = new Date();
    const todayStr = today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    // --- Helpers ---
    const formatTime = (t) => {
        if (!t) return '';
        
        const timeValue = t.time || t;
        
        if (!timeValue || typeof timeValue !== 'string') return ''; 

        const d = new Date(timeValue);
        
        if (isNaN(d.getTime())) {
             console.error("Invalid date value found:", timeValue);
             return 'Error Time'; 
        }

        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    
    const formatDate = (d) =>
        d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const sortByTime = (arr) => {
        return arr.slice().sort((a,b) => {
            const ta = new Date(a.time || a);
            const tb = new Date(b.time || b);
            
            const timeA = isNaN(ta.getTime()) ? 0 : ta.getTime();
            const timeB = isNaN(tb.getTime()) ? 0 : ta.getTime();
            
            return timeA - timeB;
        });
    };

    const getDocRefForDate = async (date) => {
        const dateKey = date.toDateString() === todayStr 
            ? 'main'
            : date.toISOString().split('T')[0]; // Format is YYYY-MM-DD
            
        const docRef = doc(db, collectionName, dateKey);
        
        const snap = await getDoc(docRef);
        if (!snap.exists() && dateKey !== 'main') {
            await setDoc(docRef, { walks: [], meals: [], snacks: [] });
        }
        
        return docRef;
    };

    const archivePreviousDay = useCallback(async (previousDay) => {
        const previousDayKey = previousDay.toISOString().split('T')[0];
        const previousDocRef = doc(db, collectionName, previousDayKey);
        
        const mainSnap = await getDoc(mainDocRef);
        if (!mainSnap.exists()) return;

        const mainData = mainSnap.data();
        
        if ((mainData.walks?.length || mainData.meals?.length || mainData.snacks?.length) && !(await getDoc(previousDocRef)).exists()) {
            console.log(`Archiving data from 'main' to history document: ${previousDayKey}`);
            
            await setDoc(previousDocRef, mainData);

            await setDoc(mainDocRef, { walks: [], meals: [], snacks: [] });

            loadHistoryDates(true);
        } else {
            console.log("No data to archive or historical document already exists.");
        }
    }, [mainDocRef, historyCollectionRef]);


    // =========================================================================
    // --- Weather Data Fetching ---
    // =========================================================================
    useEffect(() => {
        if (!API_KEY) {
            console.error("OpenWeatherMap API Key is missing. Check your .env file.");
            return;
        }

        const fetchWeather = async () => {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric`;
            try {
                const response = await axios.get(url);
                setWeatherData(response.data);
            } catch (error) {
                console.error("Error fetching weather data:", error);
                setWeatherData({}); 
            }
        };

        fetchWeather();
        // FIX: Update weather every 5 minutes (300000 ms)
        const intervalId = setInterval(fetchWeather, 300000); 

        return () => clearInterval(intervalId); 
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
    // --- Clock Update (Every 100ms) ---
    // =========================================================================
    useEffect(() => {
        // FIX: Dedicated interval for smooth second-by-second clock update
        const t = setInterval(() => {
            setCurrentTime(new Date());
        }, 100); 
        
        return () => clearInterval(t);
    }, []); 

    // =========================================================================
    // --- Day Change / Archiving Check (Every 10s) ---
    // =========================================================================
    useEffect(() => {
        let lastDay = new Date().getDate();
        // Check every 10 seconds to see if the day has changed, which is sufficient
        const t = setInterval(() => {
            const now = new Date();

            if (now.getDate() !== lastDay) {
                console.log("Day changed. Archiving previous day's data and reloading 'Today' page.");
                
                const previousDay = new Date(now);
                previousDay.setDate(now.getDate() - 1);
                
                archivePreviousDay(previousDay); 
                
                setSelectedDate(now);
                loadForDate(now); 
                loadHistoryDates(true); 
                lastDay = now.getDate();
            }
        }, 10000); // 10 seconds
        
        return () => clearInterval(t);
    }, [loadHistoryDates, archivePreviousDay]); 
    
    
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
                // FIX: Filter data first, then call setter
                setWalks(sortByTime(data.walks || []));
                setMeals((data.meals || []).filter(m => m.weight)); 
                setSnacks((data.snacks || []).filter(s => s.quantity)); 
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
        const dateKey = date.toISOString().split('T')[0];
        const dateDocRef = doc(db, collectionName, dateKey);
        const snap = await getDoc(dateDocRef);
        if (snap.exists()) {
            const data = snap.data();
            // FIX: Filter data first, then call setter
            setWalks(sortByTime(data.walks || []));
            setMeals((data.meals || []).filter(m => m.weight)); 
            setSnacks((data.snacks || []).filter(s => s.quantity));
        } else {
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
            // FIX: Filter data first, then call setter
            setWalks(sortByTime(data.walks || []));
            setMeals((data.meals || []).filter(m => m.weight));
            setSnacks((data.snacks || []).filter(s => s.quantity));
        });
        return () => unsub();
    }, [selectedDate, todayStr]);

    // --- CRUD functions (Simplified with helper function) ---
    const refresh = async () => loadForDate(selectedDate);

    const handleAction = async (updateData, isNewDoc = false) => {
        const docRef = await getDocRefForDate(selectedDate);
        await updateDoc(docRef, updateData);
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
    
    const addCustomMeal = async () => {
        const timeInput = prompt('Enter meal time (HH:mm:ss):');
        if (!timeInput) return;
        const weightInput = prompt('Enter the weight (grams):');
        if (weightInput === null || isNaN(parseInt(weightInput)) || parseInt(weightInput) <= 0) return alert('Invalid weight!');

        const [h, m, s] = timeInput.split(':').map(Number);
        const now = new Date();
        const customTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m||0, s||0).toISOString();
        
        const newMeal = { time: customTime, weight: parseInt(weightInput) };
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
    
    // FIX: Add custom snack function for consistency
    const addCustomSnack = async () => {
        const timeInput = prompt('Enter snack time (HH:mm:ss):');
        if (!timeInput) return;
        const type = prompt('Enter snack type:');
        if (!type) return;
        const qty = prompt('Enter quantity:');
        if (!qty || isNaN(parseInt(qty)) || parseInt(qty) <= 0) return alert('Invalid quantity!');

        const [h, m, s] = timeInput.split(':').map(Number);
        const now = new Date();
        const customTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m||0, s||0).toISOString();
        
        const newSnack = { time: customTime, type, quantity: parseInt(qty) };
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
    
    const getNextWalkTime = () => {
        if (!walks.length) return 'Add first walk';
        const last = new Date(walks[walks.length-1].time || walks[walks.length-1]);
        const next = new Date(last.getTime() + 3 * 60 * 60 * 1000);
        
        if (isNaN(last.getTime())) return 'Time calculation error';
        
        return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const isWalkDue = () => {
        if (isHistoryMode) return false;
        if (!walks.length) return true;
        const last = new Date(walks[walks.length-1].time || walks[walks.length-1]);
        
        if (isNaN(last.getTime())) return true; 

        const hours = (currentTime - last) / (1000 * 60 * 60);
        return hours >= 3;
    };


    return (
        // KEY FIX: Using min-h-screen and style={{ height: '100dvh' }} to fix mobile viewport height issues
        <div className="flex w-screen min-h-screen bg-black text-white overflow-hidden" style={{ height: '100dvh' }}>
            
            {/* Sidebar (History Panel) */}
            <div className={`absolute top-0 bottom-0 w-48 bg-black border-r border-white/20 z-20 
                transform transition-transform duration-300 overflow-y-auto 
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                <div className="flex justify-between items-center p-2 border-b border-white/20 sticky top-0 bg-black">
                     <p className="font-bold text-lg">History</p>
                     <button onClick={() => setIsSidebarOpen(false)} className="text-xl button p-1">X</button>
                </div>
                
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 100px)' }}>
                    
                    {availableDates === null && (
                        <p className="p-2 text-center text-gray-500">Loading history...</p>
                    )}

                    {availableDates !== null && availableDates.length === 0 && (
                        <p className="p-2 text-center text-gray-500">No past logs found.</p>
                    )}
                    
                    {availableDates !== null && availableDates.map((d) => (
                        <div
                            key={d}
                            className={`p-2 text-center cursor-pointer hover:bg-white/10 border-b border-white/10 text-sm ${d===selectedDate.toDateString()?'bg-white/20 font-bold':''}`}
                            onClick={()=>{
                                setSelectedDate(new Date(d));
                                setIsSidebarOpen(false);
                            }}
                        >
                            {d === todayStr ? 'TODAY' : d === yesterdayStr ? 'YESTERDAY' : d}
                        </div>
                    ))}
                    
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
            <div className="flex flex-col flex-1 p-1 lg:p-2 gap-1 lg:gap-2"> 
                
                {/* Top: Date & Weather (flex-shrink-0) */}
                <div className="flex flex-row gap-1 lg:gap-2 flex-shrink-0" style={{ height: '30vh', minHeight: '150px' }}>
                    
                    {/* Clock / Date Display */}
                    <div className="flex flex-col justify-center border border-white/20 p-1 lg:p-4 text-center bg-black basis-1/2">
                        {isHistoryMode ? (
                            <p className="text-[clamp(1.2rem,6vw,3rem)] font-bold text-yellow-400 leading-tight">
                                History: {formatDate(selectedDate)}
                            </p>
                        ) : (
                            <>
                                <p className="text-[clamp(2.5rem,14vw,6rem)] lg:text-[clamp(3rem,12vw,6rem)] font-bold leading-none">
                                    {currentTime.toLocaleTimeString()}
                                </p>
                                <p className="text-[clamp(0.8rem,4vw,2.5rem)] lg:text-[clamp(1.5rem,6vw,2.5rem)] text-gray-300 leading-tight">
                                    {formatDate(currentTime)}
                                </p>
                            </>
                        )}
                    </div>
                    
                    {/* Weather Card (Mölndal) */}
                    <div className="flex flex-col justify-center border border-white/20 p-1 lg:p-4 text-center bg-black min-h-0 basis-1/2">
                        <p className="text-[clamp(0.7rem,3vw,1.5rem)] mb-0.5 lg:mb-2 font-semibold leading-tight">Mölndal, SE</p>
                        <div className="flex items-center justify-center gap-1 lg:gap-4 mb-0.5 lg:mb-2">
                            <p className="text-[clamp(2rem,10vw,7rem)] lg:text-[clamp(3rem,12vw,7rem)] leading-none"> 
                                {weatherData && weatherData.weather ? getWeatherEmoji(weatherData.weather[0].icon) : '❓'}
                            </p>
                            <p className="text-[clamp(1.5rem,8vw,5rem)] lg:text-[clamp(2rem,10vw,5rem)] font-bold leading-none">
                                {weatherData && weatherData.main ? `${Math.round(weatherData.main.temp)}°C` : '...'}
                            </p>
                        </div>
                        {weatherData && weatherData.weather && <p className="capitalize text-[clamp(0.6rem,2.5vw,1.5rem)] text-gray-300 leading-tight">{weatherData.weather[0].description}</p>}
                        
                        {weatherData && weatherData.main && <p className="text-[clamp(0.6rem,2vw,1.2rem)] text-gray-400 mt-1 leading-tight">H: {weatherData.main.humidity}% | W: {weatherData.wind.speed} m/s</p>}
                        
                        {weatherData === {} && <p className="text-red-400 text-xs">Error</p>}
                    </div>
                </div>

                {/* Middle: Next Walk Alert / Controls (flex-shrink-0) */}
                <div className="flex items-center justify-between p-1 border border-white/20 text-xl bg-black flex-shrink-0">
                    
                    {/* Left Control Group (Calendar & Edit) */}
                    <div className="flex items-center gap-1 lg:gap-4">
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="w-7 h-7 lg:w-10 lg:h-10 flex items-center justify-center cursor-pointer border border-yellow-400 rounded bg-white/10 hover:bg-white/20 p-0"
                        >
                            <CalendarDays className="text-yellow-400 w-4 h-4 lg:w-6 lg:h-6" />
                        </button>

                        <button 
                            onClick={()=>setEditMode(!editMode)} 
                            className={`w-7 h-7 lg:w-10 lg:h-10 flex items-center justify-center cursor-pointer border rounded p-0 
                                ${editMode 
                                    ? 'bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white' 
                                    : 'border-white/40 bg-white/10 hover:bg-white/20 text-yellow-400'
                                }`}
                        >
                            <Edit className="w-4 h-4 lg:w-6 lg:h-6" />
                        </button>

                        <p className={`${isWalkDue() ? 'walk-due-alert text-yellow-400' : 'text-green-400'} font-bold text-xs lg:text-xl ml-1 leading-tight`}>
                            {isWalkDue() ? 'WALK DUE! 🐾' : `Next walk: ${getNextWalkTime()}`}
                        </p>
                    </div>
                    
                    {/* Right Control Group (Reset Button) */}
                    {(!isHistoryMode && walks.length > 0) && (
                        <button onClick={resetDay} className="button border-red-500 text-red-400 hover:bg-red-900/50 text-xs p-1 lg:text-sm">Reset</button>
                    )}
                </div>

                {/* Bottom: Logs (flex-1 and overflow-y-auto is the key) */}
                <div className="flex-1 flex flex-col lg:flex-row gap-1 lg:gap-2 overflow-y-auto">
                    
                    {/* Walks Card (flex-1 and min-h-0 is the key) */}
                    <div className="flex-1 flex flex-col border border-white/20 p-1 lg:p-2 overflow-hidden bg-black min-h-0 lg:min-h-[300px]">
                        <p className="font-bold mb-1 text-center text-sm lg:text-xl border-b border-white/20 pb-0.5 flex-shrink-0">Walks ({walks.length})</p>
                        {/* Scrollable Log List */}
                        <div className="flex-1 overflow-y-auto">
                            {walks.map((w,i)=>(
                                <div key={i} className="flex items-center justify-between mb-0.5 text-sm lg:text-base p-0.5 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-0.5 truncate">
                                        <PawPrint className="w-3 h-3 lg:w-5 lg:h-5 text-yellow-400 flex-shrink-0" />
                                        <p className="truncate text-[0.6rem] lg:text-sm leading-tight">Diza ended walk at <span className="font-bold text-white">{formatTime(w.time||w)}</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-0.5 flex-shrink-0">
                                            <button onClick={()=>editWalk(i)} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <Edit className="w-3 h-3 text-yellow-400" />
                                            </button>
                                            <button onClick={()=>deleteEntry(i,'walks')} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <div className="text-[0.6rem] leading-none">🗑️</div>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {walks.length === 0 && <p className="text-center text-gray-400 mt-1 text-[0.6rem] lg:text-base">No walks logged for this day.</p>}
                        </div>
                        {/* Buttons (Side-by-side on all screens) */}
                        {(!isHistoryMode || editMode) && (
                            <div className="flex gap-0.5 mt-1 pt-1 border-t border-white/20 flex-shrink-0">
                                <button onClick={addWalk} className="button flex-1 bg-green-700 hover:bg-green-600 text-[0.6rem] lg:text-sm p-1">Add Walk Now</button>
                                <button onClick={addCustomWalk} className="button flex-1 text-[0.6rem] lg:text-sm p-1">Add Custom Time</button>
                            </div>
                        )}
                    </div>

                    {/* Meals Card */}
                    <div className="flex-1 flex flex-col border border-white/20 p-1 lg:p-2 overflow-hidden bg-black min-h-0 lg:min-h-[300px]">
                        <p className="font-bold mb-1 text-center text-sm lg:text-xl border-b border-white/20 pb-0.5 flex-shrink-0">Meals ({meals.length})</p>
                        <div className="flex-1 overflow-y-auto">
                            {meals.map((m,i)=>(
                                <div key={i} className="flex items-center justify-between mb-0.5 text-sm lg:text-base p-0.5 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-0.5 truncate">
                                        <Utensils className="w-3 h-3 lg:w-5 lg:h-5 text-pink-400 flex-shrink-0" />
                                        <p className="truncate text-[0.6rem] lg:text-sm leading-tight">Ate at <span className="font-bold text-white">{formatTime(m.time)}</span> - <span className="font-bold text-white">{m.weight}g</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-0.5 flex-shrink-0">
                                            <button onClick={()=>editMeal(i)} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <Edit className="w-3 h-3 text-yellow-400" />
                                            </button>
                                            <button onClick={()=>deleteEntry(i,'meals')} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <div className="text-[0.6rem] leading-none">🗑️</div>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {meals.length === 0 && <p className="text-center text-gray-400 mt-1 text-[0.6rem] lg:text-base">No meals logged for this day.</p>}
                        </div>
                        {(!isHistoryMode || editMode) && (
                            <div className="flex gap-0.5 mt-1 pt-1 border-t border-white/20 flex-shrink-0">
                                <button onClick={addMeal} className="button flex-1 bg-pink-700 hover:bg-pink-600 text-[0.6rem] lg:text-sm p-1">Add Meal Now</button>
                                <button onClick={addCustomMeal} className="button flex-1 text-[0.6rem] lg:text-sm p-1">Add Custom Meal</button>
                            </div>
                        )}
                    </div>

                    {/* Snacks Card */}
                    <div className="flex-1 flex flex-col border border-white/20 p-1 lg:p-2 overflow-hidden bg-black min-h-0 lg:min-h-[300px]">
                        <p className="font-bold mb-1 text-center text-sm lg:text-xl border-b border-white/20 pb-0.5 flex-shrink-0">Snacks ({snacks.length})</p>
                        <div className="flex-1 overflow-y-auto">
                            {snacks.map((s,i)=>(
                                <div key={i} className="flex items-center justify-between mb-0.5 text-sm lg:text-base p-0.5 border-b border-white/10 last:border-b-0">
                                    <div className="flex items-center gap-0.5 truncate">
                                        <Bone className="w-3 h-3 lg:w-5 lg:h-5 text-orange-400 flex-shrink-0" />
                                        <p className="truncate text-[0.6rem] lg:text-sm leading-tight">{s.quantity} x {s.type} at <span className="font-bold text-white">{formatTime(s.time)}</span></p>
                                    </div>
                                    {(!isHistoryMode || editMode) && (
                                        <div className="flex gap-0.5 flex-shrink-0">
                                            <button onClick={()=>editSnack(i)} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <Edit className="w-3 h-3 text-yellow-400" />
                                            </button>
                                            <button onClick={()=>deleteEntry(i,'snacks')} className="flex items-center justify-center border border-white/40 rounded bg-white/10 hover:bg-white/20 p-0 w-4 h-4">
                                                <div className="text-[0.6rem] leading-none">🗑️</div>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {snacks.length === 0 && <p className="text-center text-gray-400 mt-1 text-[0.6rem] lg:text-base">No snacks logged for this day.</p>}
                        </div>
                        {/* Two buttons for consistency across all cards */}
                        {(!isHistoryMode || editMode) && (
                            <div className="flex gap-0.5 mt-1 pt-1 border-t border-white/20 flex-shrink-0">
                                <button onClick={addSnack} className="button flex-1 bg-orange-700 hover:bg-orange-600 text-[0.6rem] lg:text-sm p-1">Add Snack Now</button>
                                <button onClick={addCustomSnack} className="button flex-1 text-[0.6rem] lg:text-sm p-1">Add Custom Snack</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}