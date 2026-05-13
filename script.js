import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    serverTimestamp,
    doc,
    setDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import firebaseConfig from './config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// --- Auth UI Logic ---
const loginOverlay = document.getElementById('loginOverlay');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginName = document.getElementById('loginName');
const nameGroup = document.getElementById('nameGroup');
const toggleSignup = document.getElementById('toggleSignup');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');

let isLoginMode = true;

toggleSignup.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    loginSubmitBtn.innerText = isLoginMode ? 'Sign In' : 'Sign Up';
    toggleSignup.innerText = isLoginMode ? 'Sign Up' : 'Sign In';
    nameGroup.style.display = isLoginMode ? 'none' : 'block';
    document.querySelector('.login-header h1').innerText = isLoginMode ? 'Welcome to Communitter' : 'Create Account';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginEmail.value;
    const password = loginPassword.value;
    const name = loginName.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: name
            });
            // Save user to Firestore
            await setDoc(doc(db, "users", email), {
                displayName: name,
                email: email,
                photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
            });
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            alert("This email is already registered. Please sign in instead.");
            // Automatically switch to login mode
            isLoginMode = true;
            loginSubmitBtn.innerText = 'Sign In';
            toggleSignup.innerText = 'Sign Up';
            nameGroup.style.display = 'none';
            document.querySelector('.login-header h1').innerText = 'Welcome to Communitter';
        } else {
            alert(error.message);
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        document.querySelector('.sidebar-header .profile-pic').src = user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid;
        document.getElementById('currentUserDisplayName').innerText = user.displayName || user.email.split('@')[0];
        
        // Ensure user exists in Firestore 'users' collection
        await setDoc(doc(db, "users", user.email), {
            displayName: user.displayName || user.email.split('@')[0],
            email: user.email,
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`
        }, { merge: true });

        // Listen for user's chats
        loadUserChats();
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// --- Chat App Logic ---
// Removed sample accounts
let chats = []; 
let activeChatId = null;

// Elements
const chatListEl = document.getElementById('chatList');
const messageDisplay = document.getElementById('messageDisplay');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const activeChatName = document.getElementById('activeChatName');
const activeChatStatus = document.getElementById('activeChatStatus');
const activeChatPic = document.getElementById('activeChatPic');
const chatHeader = document.getElementById('chatHeader');
const chatInputArea = document.getElementById('chatInputArea');
const mainChatArea = document.querySelector('.main-chat');

// New Chat Modal Elements
const newChatBtn = document.getElementById('newChatBtn');
const newChatModal = document.getElementById('newChatModal');
const closeModal = document.getElementById('closeModal');
const startChatBtn = document.getElementById('startChatBtn');
const newChatEmailInput = document.getElementById('newChatEmail');

// Render Chat List
function renderChatList() {
    if (chats.length === 0) {
        chatListEl.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
                <i data-lucide="message-square" style="width: 48px; height: 48px; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>No chats yet. Start a new one!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    chatListEl.innerHTML = chats.map(chat => `
        <div class="chat-item ${chat.id === activeChatId ? 'active' : ''}" onclick="selectChat('${chat.id}')">
            <img src="${chat.pic}" alt="${chat.name}" class="profile-pic">
            <div class="chat-info">
                <div class="chat-name-row">
                    <span class="chat-name">${chat.name}</span>
                    <span class="chat-time">${chat.time}</span>
                </div>
                <p class="chat-last-msg">${chat.lastMsg}</p>
            </div>
        </div>
    `).join('');
}

// Select Chat
window.selectChat = (id) => {
    activeChatId = id;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    
    activeChatName.innerText = chat.name;
    activeChatStatus.innerText = chat.status;
    activeChatPic.src = chat.pic;
    activeChatStatus.style.color = chat.status === 'Online' ? '#10b981' : '#94a3b8';

    chatHeader.style.display = 'flex';
    chatInputArea.style.display = 'flex';

    // Mobile: Hide sidebar when chat is selected
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    console.log("Chat selected. Mobile mode:", isMobile, "Width:", window.innerWidth);
    if (isMobile) {
        document.querySelector('.sidebar').classList.add('hidden');
    }

    renderChatList();
    loadMessages(id);
};

// Load User's Chats from Firestore
function loadUserChats() {
    if (!currentUser) return;

    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser.email)
    );

    onSnapshot(q, async (snapshot) => {
        const chatPromises = snapshot.docs.map(async (chatDoc) => {
            const data = chatDoc.data();
            const otherParticipantEmail = data.participants.find(p => p !== currentUser.email);
            
            // Default to email prefix
            let name = otherParticipantEmail ? otherParticipantEmail.split('@')[0] : "Me";
            let pic = `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipantEmail || currentUser.email}`;

            // Try to fetch name from users collection
            if (otherParticipantEmail) {
                const userDocRef = doc(db, "users", otherParticipantEmail);
                const userDoc = await getDocs(query(collection(db, "users"), where("email", "==", otherParticipantEmail)));
                if (!userDoc.empty) {
                    const userData = userDoc.docs[0].data();
                    name = userData.displayName || name;
                    pic = userData.photoURL || pic;
                }
            }

            return {
                id: chatDoc.id,
                name: name,
                pic: pic,
                status: 'Online',
                lastMsg: data.lastMsg || 'No messages yet',
                time: data.lastUpdated ? data.lastUpdated.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                messages: []
            };
        });

        chats = await Promise.all(chatPromises);
        renderChatList();
        
        // If there's an active chat, refresh its display name too
        if (activeChatId) {
            const activeChat = chats.find(c => c.id === activeChatId);
            if (activeChat) {
                activeChatName.innerText = activeChat.name;
            }
        }
    });
}

// Load Messages for active chat
let messagesUnsubscribe = null;
function loadMessages(chatId) {
    if (messagesUnsubscribe) messagesUnsubscribe();

    const q = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "asc")
    );

    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                type: data.sender === currentUser.email ? 'sent' : 'received',
                text: data.text,
                time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            };
        });

        const chat = chats.find(c => c.id === chatId);
        if (chat) chat.messages = messages;
        
        renderMessages(messages);
    });
}

// Render Messages
function renderMessages(messagesToRender = []) {
    if (!activeChatId) {
        messageDisplay.innerHTML = `
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--text-muted);">
                <div style="width: 80px; height: 80px; background: var(--glass-bg); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                    <i data-lucide="messages-square" style="width: 40px; height: 40px;"></i>
                </div>
                <h2>Select a chat to start messaging</h2>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    messageDisplay.innerHTML = messagesToRender.map(msg => `
        <div class="message ${msg.type}">
            ${msg.text}
            <span class="message-time">${msg.time}</span>
        </div>
    `).join('');
    
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

// Send Message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatId || !currentUser) return;

    try {
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: text,
            sender: currentUser.email,
            timestamp: serverTimestamp()
        });

        // Update last message in the chat doc
        await setDoc(doc(db, "chats", activeChatId), {
            lastMsg: text,
            lastUpdated: serverTimestamp()
        }, { merge: true });

        messageInput.value = '';
    } catch (e) {
        console.error("Error sending message: ", e);
    }
}

// Event Listeners
if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        console.log("Logout clicked");
        signOut(auth);
    });
}

// Back Button Listener (Mobile)
const backBtn = document.getElementById('backBtn');
if (backBtn) {
    backBtn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('hidden');
    });
}

// New Chat Modal Listeners
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
        console.log("New Chat clicked");
        newChatModal.style.display = 'flex';
    });
}

if (closeModal) {
    closeModal.addEventListener('click', () => {
        newChatModal.style.display = 'none';
        newChatEmailInput.value = '';
    });
}

if (startChatBtn) {
    startChatBtn.addEventListener('click', async () => {
        const email = newChatEmailInput.value.trim();
        if (!email || !currentUser) return;

        try {
            // Check if chat already exists
            const q = query(
                collection(db, "chats"), 
                where("participants", "array-contains", currentUser.email)
            );
            const querySnapshot = await getDocs(q);
            let existingChatId = null;
            
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.participants.includes(email)) {
                    existingChatId = doc.id;
                }
            });

            if (existingChatId) {
                selectChat(existingChatId);
            } else {
                // Create new chat
                const newChatRef = await addDoc(collection(db, "chats"), {
                    participants: [currentUser.email, email],
                    lastMsg: "Started a new conversation",
                    lastUpdated: serverTimestamp()
                });
                selectChat(newChatRef.id);
            }
            
            newChatModal.style.display = 'none';
            newChatEmailInput.value = '';
        } catch (e) {
            console.error("Error starting chat:", e);
            alert("Could not start chat. Please make sure you have enabled Firestore in your Firebase console and set the rules to 'test mode'.");
        }
    });
}

// Initial Render
renderChatList();
renderMessages();
lucide.createIcons();
