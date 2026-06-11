const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
const employeesFile = path.join(dataDir, 'employees.json');

const read = () => JSON.parse(fs.readFileSync(employeesFile));
const write = (data) => fs.writeFileSync(employeesFile, JSON.stringify(data, null, 2));

router.get('/', (req, res) => {
  try {
    res.json({ success: true, data: read() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const emp = read().find(e => e.id === req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: emp });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const employees = read();
    const newEmp = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    employees.push(newEmp);
    write(employees);
    res.json({ success: true, data: newEmp, message: 'Employee added!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const employees = read();
    const idx = employees.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
    employees[idx] = { ...employees[idx], ...req.body, updatedAt: new Date().toISOString() };
    write(employees);
    res.json({ success: true, data: employees[idx], message: 'Employee updated!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const employees = read().filter(e => e.id !== req.params.id);
    write(employees);
    res.json({ success: true, message: 'Employee deleted!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
