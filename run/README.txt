==============================================================================
HOSTEL & MESS MANAGEMENT SYSTEM (DA2 DATABASE IMPLEMENTATION)
Student: Garvit Kaushik (Registration Number: 25BCE5689)
==============================================================================

QUICK RUN INSTRUCTIONS:
-----------------------
Simply double-click:
    RUN.bat (located inside this 'run' folder)

It will automatically:
1. Start the backend server on http://localhost:4000
2. Direct your default web browser straight to the application dashboard!

ADDITIONAL RUN UTILITIES IN THIS FOLDER:
---------------------------------------
- RUN.bat                : Master click-to-run launcher (starts server & opens browser).
- START_BACKEND.bat      : Launches the Node.js API server in an open console for logs.
- OPEN_DASHBOARD.bat     : Directly opens http://localhost:4000 in your browser.
- SETUP_MYSQL_DATABASE.bat : Automatically imports database\init.sql into your MySQL.

FEATURES IMPLEMENTED:
--------------------
1. Complete Database Schema (17 Relational Tables fully populated with data).
2. Advanced PL/SQL Routines:
   - Stored Procedures: AllocateRoom, RegisterMess, UpdateComplaintStatus, VacateRoom
   - Stored Functions : AvailableBeds, HostelOccupancyPercentage, CountStudentsInMess, TotalComplaintsOfStudent
   - Triggers         : Dynamic Room Occupancy tracking & Single Active Allocation constraints
   - Views            : HostelOccupancy, StudentRoomDetails, StudentMessDetails, PendingComplaints, MessRevenueSummary
3. Modern Web Dashboard:
   - Student Management with full INSERT, UPDATE, and DELETE (CRUD).
   - Room Allocation management with bed vacancy calculation.
   - Mess Management with subscription changes, payments, and menus.
   - Grievance Desk with lifecycle status tracking.
4. Interactive SQL & PL/SQL Query Console:
   - 16 pre-configured analytical queries with live execution, timing benchmarks, and tabular results.
