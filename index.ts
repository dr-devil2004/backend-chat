import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);

// Get port from environment variable
const PORT = process.env.PORT || 3000;

// Get allowed origins from environment or use defaults
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'https://frontend-chat-psi.vercel.app',
  'https://frontend-chat-dr-devil2004.vercel.app',
  'https://frontend-chat-git-main-dr-devil2004.vercel.app',
  'https://frontend-chat-liart.vercel.app'
];

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

app.use(express.json());

// Add a simple health check endpoint
app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.send('Chat server is running');
});

// Store active users
interface User {
  id: string;
  username: string;
}

// Store messages
interface Message {
  id: string;
  text: string;
  userId: string;
  username: string;
  timestamp: Date;
}

const users: User[] = [];
const messages: Message[] = [];

// Helper function to find user by ID
const findUserById = (id: string) => users.find(user => user.id === id);

// Helper function to find user by username
const findUserByUsername = (username: string) => users.find(user => user.username === username);

// Socket.io connection handling
io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins chat
  socket.on('join', (username: string) => {
    // Check if this socket already has a user
    const existingUserWithSameId = findUserById(socket.id);
    if (existingUserWithSameId) {
      console.log(`User with ID ${socket.id} already exists, not adding duplicate`);
      
      // Just send the current state to the user
      socket.emit('welcome', {
        user: existingUserWithSameId,
        users,
        messages,
      });
      return;
    }
    
    // Check if a user with this username already exists
    const existingUserWithSameUsername = findUserByUsername(username);
    if (existingUserWithSameUsername) {
      console.log(`User with username ${username} already exists, removing old entry`);
      
      // Remove the old user entry
      const index = users.findIndex(user => user.username === username);
      if (index !== -1) {
        users.splice(index, 1);
      }
    }
    
    // Create a new user
    const user: User = {
      id: socket.id,
      username: username,
    };
    
    // Add the user to our list
    users.push(user);
    
    // Emit to the joining user
    socket.emit('welcome', {
      user,
      users,
      messages,
    });
    
    // Broadcast to all other users
    socket.broadcast.emit('userJoined', {
      user,
      users,
    });
    
    console.log(`${username} joined the chat`);
  });

  // User sends a message
  socket.on('sendMessage', (messageText: string) => {
    const user = findUserById(socket.id);
    
    if (user) {
      const message: Message = {
        id: Date.now().toString(),
        text: messageText,
        userId: socket.id,
        username: user.username,
        timestamp: new Date(),
      };
      
      messages.push(message);
      
      // Send to all users
      io.emit('newMessage', message);
      
      console.log(`Message from ${user.username}: ${messageText}`);
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    const index = users.findIndex(user => user.id === socket.id);
    
    if (index !== -1) {
      const user = users[index];
      users.splice(index, 1);
      
      // Broadcast to remaining users
      socket.broadcast.emit('userLeft', {
        userId: socket.id,
        users,
      });
      
      console.log(`${user.username} left the chat`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is ready to accept connections from frontend`);
}); 