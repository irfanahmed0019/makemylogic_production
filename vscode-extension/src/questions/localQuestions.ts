import { Question } from './types';

export const localPythonQuestions: Question[] = [
	{
		id: 'voting-eligibility', title: 'Voting Eligibility', language: 'python', difficulty: 'Easy',
		description: 'Write a program that decides whether a person can vote.', tags: ['Conditionals', 'Input'],
		requirements: ['Read an age as a number.', 'Print "Eligible" for ages 18 and over.', 'Print "Not eligible" for younger ages.'],
		starterCode: 'age = int(input("Enter your age: "))\n# Write your condition below\n',
		tests: [{ name: 'Adult voter', description: 'Age 18 is eligible.' }, { name: 'Younger voter', description: 'Age 17 is not eligible.' }],
	},
	{
		id: 'cli-calculator', title: 'Build a CLI Calculator', language: 'python', difficulty: 'Easy',
		description: 'Create a simple command-line calculator using Python.', tags: ['Input/Output', 'Functions', 'Conditionals'],
		requirements: ['Accept two numbers and an operation.', 'Support addition, subtraction, multiplication, and division.', 'Handle division by zero clearly.'],
		starterCode: 'def calculate(first, operation, second):\n    # Return the answer\n    pass\n',
		tests: [{ name: 'Addition', description: '2 + 3 returns 5.' }, { name: 'Zero division', description: 'Division by zero is handled.' }],
	},
	{
		id: 'number-guessing', title: 'Number Guessing Game', language: 'python', difficulty: 'Medium',
		description: 'Build a loop that lets a player guess a secret number.', tags: ['Loops', 'Conditionals', 'Input'],
		requirements: ['Store a secret number.', 'Keep asking until the guess is correct.', 'Tell the player whether a wrong guess is too high or too low.'],
		starterCode: 'secret_number = 7\n# Ask for guesses here\n',
	},
	{
		id: 'even-or-odd', title: 'Even or Odd', language: 'python', difficulty: 'Easy',
		description: 'Classify a number as even or odd.', tags: ['Operators', 'Conditionals'],
		requirements: ['Read an integer.', 'Use the modulo operator.', 'Print either "Even" or "Odd".'],
		starterCode: 'number = int(input("Enter a number: "))\n',
	},
	{
		id: 'grade-calculator', title: 'Grade Calculator', language: 'python', difficulty: 'Medium',
		description: 'Convert a score into a letter grade.', tags: ['Conditionals', 'Ranges'],
		requirements: ['Read a score from 0 to 100.', 'Assign grades A through F using sensible ranges.', 'Reject scores outside the valid range.'],
		starterCode: 'score = int(input("Score: "))\n# Decide the grade\n',
	},
];
