'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM types
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_books_status" AS ENUM (
        'pending', 'analyzing', 'splitting', 'anchoring',
        'preparing_scenes', 'ready', 'publishing', 'done', 'error'
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_chapters_status" AS ENUM ('draft', 'editing', 'illustrated');
    `);

    // Books
    await queryInterface.createTable('books', {
      id: { type: Sequelize.STRING(10), primaryKey: true },
      title: { type: Sequelize.STRING(500), allowNull: true },
      author: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: '"enum_books_status"', defaultValue: 'pending' },
      error_msg: { type: Sequelize.TEXT, allowNull: true },
      storage_key: { type: Sequelize.STRING(500), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    // Bibles
    await queryInterface.createTable('bibles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      book_id: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE',
      },
      data: { type: Sequelize.JSONB, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    // Chapters
    await queryInterface.createTable('chapters', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      book_id: {
        type: Sequelize.STRING(10),
        allowNull: false,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE',
      },
      number: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING(500), allowNull: true },
      content: { type: Sequelize.TEXT, allowNull: false },
      status: { type: '"enum_chapters_status"', defaultValue: 'draft' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('chapters', ['book_id', 'number'], { unique: true });

    // Scenes
    await queryInterface.createTable('scenes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      chapter_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'chapters', key: 'id' },
        onDelete: 'CASCADE',
      },
      paragraph_index: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      visual_description: { type: Sequelize.TEXT, allowNull: false },
      entities: { type: Sequelize.JSONB, allowNull: true },
      setting: { type: Sequelize.TEXT, allowNull: true },
      mood: { type: Sequelize.STRING(100), allowNull: true },
    });

    await queryInterface.addIndex('scenes', ['chapter_id']);

    // Scene Variants
    await queryInterface.createTable('scene_variants', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      scene_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'scenes', key: 'id' },
        onDelete: 'CASCADE',
      },
      storage_key: { type: Sequelize.STRING(500), allowNull: false },
      score: { type: Sequelize.FLOAT, allowNull: true },
      selected: { type: Sequelize.BOOLEAN, defaultValue: false },
      width: { type: Sequelize.INTEGER, allowNull: true },
      height: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('scene_variants', ['scene_id']);

    // Anchors
    await queryInterface.createTable('anchors', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      book_id: {
        type: Sequelize.STRING(10),
        allowNull: false,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(200), allowNull: false },
      storage_key: { type: Sequelize.STRING(500), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('anchors', ['book_id']);

    // Jobs
    await queryInterface.createTable('jobs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      book_id: {
        type: Sequelize.STRING(10),
        allowNull: false,
        references: { model: 'books', key: 'id' },
        onDelete: 'CASCADE',
      },
      bullmq_id: { type: Sequelize.STRING(200), allowNull: true },
      status: { type: Sequelize.STRING(50), allowNull: false },
      error: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('jobs', ['book_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('jobs');
    await queryInterface.dropTable('anchors');
    await queryInterface.dropTable('scene_variants');
    await queryInterface.dropTable('scenes');
    await queryInterface.dropTable('chapters');
    await queryInterface.dropTable('bibles');
    await queryInterface.dropTable('books');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_chapters_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_books_status";');
  },
};
