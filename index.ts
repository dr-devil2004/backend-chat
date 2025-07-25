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
  'https://frontend-chat-liart.vercel.app',
  'https://frontend-chat-beta.vercel.app'
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
  allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Credentials'],
  exposedHeaders: ['Access-Control-Allow-Origin', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Credentials'],
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
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Headers', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Credentials']
  },
  allowEIO3: true,
  transports: ['polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: false,
  perMessageDeflate: false,
  httpCompression: {
    threshold: 2048
  },
  path: '/socket.io/',
  serveClient: false,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true
  }
});

// Add keep-alive headers
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Access-Control-Allow-Methods, Access-Control-Allow-Credentials');
  next();
});

app.use(express.json());

// Add a simple health check endpoint
app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5');
  res.send('Chat server is running');
});

// Add a WebSocket health check endpoint
app.get('/ws-health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5');
  res.json({ status: 'ok', ws: true });
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

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is ready to accept connections from frontend`);
}); 