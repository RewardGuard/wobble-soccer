/**
 * Tunable constants for the simulation.  Mirrors the Python core
 * (`wobblesoccer/core/config.py`) so the browser game and the RL env share the
 * same rules.  Coordinate system: x = goal-to-goal, z = across pitch, y = up.
 * Team 0 (red) attacks +x; team 1 (blue) attacks -x.
 */
export const C = {
  // pitch
  HALF_LENGTH: 20.0,
  HALF_WIDTH: 13.0,
  GOAL_HALF_WIDTH: 4.0,
  GOAL_HEIGHT: 4.0,
  WALL_RESTITUTION: 0.65,

  // ball
  BALL_RADIUS: 0.4,
  GRAVITY: 22.0,
  GROUND_RESTITUTION: 0.55,
  BALL_GROUND_DAMP: 0.97,
  BALL_AIR_DAMP: 0.999,

  // players
  PLAYER_RADIUS: 0.7,
  PLAYER_MAX_SPEED: 8.5,
  PLAYER_ACCEL: 62.0,
  PLAYER_PUSH: 0.6,

  // possession / dribbling
  CAPTURE_RADIUS: 1.3,
  CAPTURE_HEIGHT: 2.0,
  DRIBBLE_OFFSET: 1.0,
  KICK_COOLDOWN: 0.35,

  // goalkeeper (can pluck high balls inside its own box)
  GK_REACH: 2.0,
  GK_CATCH_HEIGHT: 4.0,
  GK_SPEED_BONUS: 1.12,

  // kicks (power scales with aim magnitude in [0,1])
  PASS_SPEED_MIN: 9.0,
  PASS_SPEED_MAX: 17.0,
  PASS_LOFT: 0.8,
  SHOOT_SPEED_MIN: 15.0,
  SHOOT_SPEED_MAX: 26.0,
  SHOOT_LOFT: 1.6,

  // AI
  SHOOT_RANGE: 13.5,
  AIM_NOISE: 0.07,
  CHASE_LEAD: 0.18,

  // match
  DT: 1.0 / 30.0, // fixed 30 Hz sim; the renderer interpolates to 60fps
  MATCH_SECONDS: 180.0,
  TEAM_SIZE: 5,
};
