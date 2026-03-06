import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Swords, RotateCcw, Info } from 'lucide-react';

// --- Constants & Types ---

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GRAVITY = 0.6;
const GROUND_Y = 350;

type PlayerState = 'idle' | 'walking' | 'jumping' | 'punching' | 'hit' | 'dead';

interface PlayerConfig {
  x: number;
  color: string;
  name: string;
  controls: {
    left: string;
    right: string;
    jump: string;
    punch: string;
  };
  facing: 'left' | 'right';
}

class Player {
  x: number;
  y: number;
  width: number = 50;
  height: number = 80;
  color: string;
  name: string;
  velocityX: number = 0;
  velocityY: number = 0;
  health: number = 100;
  isGrounded: boolean = false;
  state: PlayerState = 'idle';
  facing: 'left' | 'right';
  controls: PlayerConfig['controls'];
  punchCooldown: number = 0;
  hitCooldown: number = 0;
  score: number = 0;

  constructor(config: PlayerConfig) {
    this.x = config.x;
    this.y = GROUND_Y - this.height;
    this.color = config.color;
    this.name = config.name;
    this.controls = config.controls;
    this.facing = config.facing;
  }

  update(keys: Set<string>, otherPlayer: Player) {
    // Cooldowns
    if (this.punchCooldown > 0) this.punchCooldown--;
    if (this.hitCooldown > 0) this.hitCooldown--;

    if (this.state === 'dead') return;

    // Movement
    if (this.hitCooldown === 0) {
      if (keys.has(this.controls.left)) {
        this.velocityX = -5;
        this.facing = 'left';
        if (this.isGrounded) this.state = 'walking';
      } else if (keys.has(this.controls.right)) {
        this.velocityX = 5;
        this.facing = 'right';
        if (this.isGrounded) this.state = 'walking';
      } else {
        this.velocityX = 0;
        if (this.isGrounded && this.state !== 'punching') this.state = 'idle';
      }

      // Jump
      if (keys.has(this.controls.jump) && this.isGrounded) {
        this.velocityY = -15;
        this.isGrounded = false;
        this.state = 'jumping';
      }

      // Punch
      if (keys.has(this.controls.punch) && this.punchCooldown === 0) {
        this.state = 'punching';
        this.punchCooldown = 20;
        this.checkHit(otherPlayer);
      }
    }

    // Apply Physics
    this.velocityY += GRAVITY;
    this.x += this.velocityX;
    this.y += this.velocityY;

    // Boundaries
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > CANVAS_WIDTH) this.x = CANVAS_WIDTH - this.width;

    // Ground Collision
    if (this.y + this.height > GROUND_Y) {
      this.y = GROUND_Y - this.height;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    // Reset state after punch
    if (this.state === 'punching' && this.punchCooldown < 10) {
      this.state = this.isGrounded ? 'idle' : 'jumping';
    }
  }

  checkHit(other: Player) {
    const punchRange = 60;
    const isFacingOther = (this.facing === 'right' && other.x > this.x) || 
                          (this.facing === 'left' && other.x < this.x);
    
    const dist = Math.abs(this.x - other.x);
    const yDist = Math.abs(this.y - other.y);

    if (isFacingOther && dist < punchRange && yDist < this.height) {
      other.takeDamage(10);
    }
  }

  takeDamage(amount: number) {
    this.health -= amount;
    this.hitCooldown = 15;
    this.state = 'hit';
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'dead';
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.width/2, GROUND_Y, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = this.color;
    if (this.state === 'hit') ctx.fillStyle = '#ffffff';
    
    // Simple character shape
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Head
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(this.x + 5, this.y - 25, 40, 30);

    // Eyes
    ctx.fillStyle = '#000';
    const eyeOffset = this.facing === 'right' ? 25 : 5;
    ctx.fillRect(this.x + eyeOffset, this.y - 15, 5, 5);
    ctx.fillRect(this.x + eyeOffset + 10, this.y - 15, 5, 5);

    // Punching Arm
    if (this.state === 'punching') {
      ctx.fillStyle = this.color;
      const armX = this.facing === 'right' ? this.x + this.width : this.x - 30;
      ctx.fillRect(armX, this.y + 20, 30, 15);
    }

    // Health Bar above head
    const barWidth = 60;
    const barHeight = 6;
    ctx.fillStyle = '#374151';
    ctx.fillRect(this.x + (this.width - barWidth)/2, this.y - 45, barWidth, barHeight);
    ctx.fillStyle = this.health > 30 ? '#10b981' : '#ef4444';
    ctx.fillRect(this.x + (this.width - barWidth)/2, this.y - 45, (this.health / 100) * barWidth, barHeight);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x + this.width/2, this.y - 55);

    ctx.restore();
  }
}

// --- Main Component ---

export default function BakuPukul() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [winner, setWinner] = useState<string | null>(null);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  
  const playersRef = useRef<{ p1: Player; p2: Player } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const initGame = () => {
    playersRef.current = {
      p1: new Player({
        x: 100,
        color: '#3b82f6',
        name: 'PLAYER 1',
        controls: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', punch: 'Space' },
        facing: 'right'
      }),
      p2: new Player({
        x: 650,
        color: '#ef4444',
        name: 'PLAYER 2',
        controls: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', punch: 'Enter' },
        facing: 'left'
      })
    };
    setGameState('playing');
    setWinner(null);
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    let animationFrameId: number;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      if (!playersRef.current) return;
      const { p1, p2 } = playersRef.current;

      // Update
      p1.update(keysRef.current, p2);
      p2.update(keysRef.current, p1);

      // Check Win Condition
      if (p1.health <= 0 && gameState === 'playing') {
        setWinner('PLAYER 2');
        setP2Score(s => s + 1);
        setGameState('gameover');
      } else if (p2.health <= 0 && gameState === 'playing') {
        setWinner('PLAYER 1');
        setP1Score(s => s + 1);
        setGameState('gameover');
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Background (Street Style)
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Ground
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
      ctx.stroke();

      // Grid lines for "street" feel
      ctx.strokeStyle = '#1f2937';
      for(let i = 0; i < CANVAS_WIDTH; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, GROUND_Y);
        ctx.lineTo(i - 100, CANVAS_HEIGHT);
        ctx.stroke();
      }

      p1.draw(ctx);
      p2.draw(ctx);

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Header / Scoreboard */}
      <div className="w-full max-w-[800px] flex justify-between items-end mb-6 border-b border-white/10 pb-4">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold">Challenger 01</span>
          <h2 className="text-4xl font-black italic leading-none">P1: {p1Score}</h2>
        </div>
        
        <div className="flex flex-col items-center">
          <Swords className="w-8 h-8 text-white/20 mb-2" />
          <div className="bg-white/5 px-4 py-1 rounded-full border border-white/10">
            <span className="text-xs font-mono tracking-widest text-white/60 uppercase">Baku Pukul Arena</span>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.2em] text-red-400 font-bold">Challenger 02</span>
          <h2 className="text-4xl font-black italic leading-none">P2: {p2Score}</h2>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative group">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-lg border-4 border-white/5 shadow-2xl bg-gray-900 cursor-none"
        />

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'menu' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10"
            >
              <motion.h1 
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="text-7xl font-black italic uppercase tracking-tighter mb-8 text-center"
              >
                Baku <span className="text-red-600">Pukul</span>
              </motion.h1>
              
              <div className="grid grid-cols-2 gap-12 mb-12">
                <div className="space-y-2 text-center">
                  <p className="text-blue-400 font-bold text-sm uppercase tracking-widest">Player 1</p>
                  <p className="text-xs text-white/60">WASD to Move</p>
                  <p className="text-xs text-white/60">SPACE to Punch</p>
                </div>
                <div className="space-y-2 text-center">
                  <p className="text-red-400 font-bold text-sm uppercase tracking-widest">Player 2</p>
                  <p className="text-xs text-white/60">ARROWS to Move</p>
                  <p className="text-xs text-white/60">ENTER to Punch</p>
                </div>
              </div>

              <button 
                onClick={initGame}
                className="group relative px-12 py-4 bg-white text-black font-black uppercase italic text-xl hover:scale-105 transition-transform active:scale-95"
              >
                <div className="absolute -inset-1 bg-red-600 -z-10 group-hover:translate-x-1 group-hover:translate-y-1 transition-transform"></div>
                Start Brawl
              </button>
            </motion.div>
          )}

          {gameState === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center rounded-lg z-20"
            >
              <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
              <h2 className="text-5xl font-black italic uppercase mb-2">KO!</h2>
              <p className="text-2xl font-bold text-white/80 mb-12">
                {winner} <span className="text-white">WINS THE ROUND</span>
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={initGame}
                  className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold uppercase hover:bg-gray-200 transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  Rematch
                </button>
                <button 
                  onClick={() => setGameState('menu')}
                  className="px-8 py-3 border border-white/20 font-bold uppercase hover:bg-white/5 transition-colors"
                >
                  Main Menu
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="mt-8 flex gap-8 text-white/40 text-[10px] uppercase tracking-[0.3em] font-medium">
        <div className="flex items-center gap-2">
          <Info className="w-3 h-3" />
          <span>Local Multiplayer Only</span>
        </div>
        <span>V1.0.0 Stable Build</span>
        <span>© 2024 Street Brawl Studio</span>
      </div>

      {/* Background Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-red-600/20 blur-[120px] rounded-full"></div>
      </div>
    </div>
  );
}
